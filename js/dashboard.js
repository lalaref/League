/**
 * ALL-IN Basketball League — 儀表板頁面邏輯
 * 動態載入最近比賽、即將賽程、公告、排名及成就
 * 需求：3.1, 3.2, 3.3, 3.4, 3.5, 15.6
 */
(function () {
  'use strict';

  // --- 頁面基礎路徑 ---
  var _pageBase = '';

  // --- DOM 元素 ---
  var recentGamesEl = document.getElementById('recent-games-list');
  var upcomingGamesEl = document.getElementById('upcoming-games-list');
  var announcementsEl = document.getElementById('announcements-list');
  var standingsBody = document.querySelector('#standings-table tbody');
  var achievementsEl = document.getElementById('achievements-list');

  // --- 當前賽季 ID（從 API 取得最新活躍賽季） ---
  var currentSeasonId = null;

  /**
   * 格式化日期：使用全局 Utils
   */
  function _formatDate(raw) { return Utils.formatDateWithDay(raw); }

  /**
   * 格式化時間：使用全局 Utils
   */
  function _formatTime(raw) { return Utils.formatTime(raw); }

  // --- 初始化 ---
  function init() {
    loadCurrentSeason();
  }

  /**
   * 載入當前活躍賽季，然後載入所有儀表板數據
   */
  function loadCurrentSeason() {
    API.getSeasons()
      .then(function (seasons) {
        if (!seasons || seasons.length === 0) {
          showEmptyAll();
          return;
        }
        // 找到 active 賽季，若無則取最新一個
        var active = null;
        for (var i = 0; i < seasons.length; i++) {
          if (seasons[i].status === 'active') {
            active = seasons[i];
            break;
          }
        }
        if (!active) active = seasons[seasons.length - 1];
        currentSeasonId = active.id;

        // 並行載入所有數據
        loadRecentGames();
        loadUpcomingGames();
        loadAnnouncements();
        loadStandings();
        loadRecentAchievements();
      })
      .catch(function () {
        showEmptyAll();
      });
  }

  // --- 最近比賽結果（需求 3.1, 3.4）---
  function loadRecentGames() {
    if (!recentGamesEl) return;
    recentGamesEl.innerHTML = '<div class="loading" data-i18n="common.loading">' + I18n.t('common.loading') + '</div>';

    API.getGames(currentSeasonId)
      .then(function (games) {
        if (!games || games.length === 0) {
          recentGamesEl.innerHTML = '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';
          return;
        }
        // 篩選已完成比賽，按日期降序，取最近 6 場
        var completed = games.filter(function (g) { return g.status === 'completed'; });
        completed.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        var recent = completed.slice(0, 6);

        if (recent.length === 0) {
          recentGamesEl.innerHTML = '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';
          return;
        }
        recentGamesEl.innerHTML = recent.map(renderGameCard).join('');
      })
      .catch(function (err) {
        console.error('[Dashboard] loadRecentGames error:', err);
        recentGamesEl.innerHTML = '<p class="text-muted">' + I18n.t('error.loadFailed') + ' <button class="btn btn-outline btn-sm" onclick="location.reload()">' + I18n.t('common.retry') + '</button></p>';
      });
  }

  /**
   * 渲染單場比賽卡片
   */
  function renderGameCard(game) {
    var homeName = game.homeTeamName || game.homeTeam || game.homeTeamId || '—';
    var awayName = game.awayTeamName || game.awayTeam || game.awayTeamId || '—';

    // Derive score from quarters when available — they are the source of truth
    var hasQuarters = game.homeQ1 || game.homeQ2 || game.homeQ3 || game.homeQ4 ||
                      game.awayQ1 || game.awayQ2 || game.awayQ3 || game.awayQ4;
    var homeScore, awayScore;
    if (hasQuarters) {
      homeScore = (parseInt(game.homeQ1, 10) || 0) + (parseInt(game.homeQ2, 10) || 0) +
                  (parseInt(game.homeQ3, 10) || 0) + (parseInt(game.homeQ4, 10) || 0);
      awayScore = (parseInt(game.awayQ1, 10) || 0) + (parseInt(game.awayQ2, 10) || 0) +
                  (parseInt(game.awayQ3, 10) || 0) + (parseInt(game.awayQ4, 10) || 0);
    } else {
      homeScore = game.homeScore != null ? game.homeScore : '—';
      awayScore = game.awayScore != null ? game.awayScore : '—';
    }

    var date = _formatDate(game.date);
    var isCompleted = game.status === 'completed';

    var html = '<div class="game-card">';
    if (isCompleted) {
      html += '<a href="' + _pageBase + 'game.html?id=' + encodeURIComponent(game.id) + '" aria-label="' + homeName + ' vs ' + awayName + '">';
    }
    html += '<div class="game-card-date text-muted">' + escapeHtml(date) + '</div>';
    html += '<div class="game-card-matchup">';
    html += '<span class="game-card-team">' + escapeHtml(homeName) + '</span>';
    html += '<span class="game-card-score">' + escapeHtml(String(homeScore)) + ' - ' + escapeHtml(String(awayScore)) + '</span>';
    html += '<span class="game-card-team">' + escapeHtml(awayName) + '</span>';
    html += '</div>';
    if (isCompleted) {
      html += '</a>';
    }
    html += '</div>';
    return html;
  }

  // --- Team data cache for jersey colors on home page ---
  var _teamsMap = {};

  /** Extract colour palette for a team (shared by logo + card bg) */
  function _teamPalette(name) {
    var palettes = [
      ['#cc0000','#ff4444','#660000'],
      ['#1144cc','#4488ff','#082288'],
      ['#118800','#44cc00','#065500'],
      ['#cc6600','#ff9900','#883300'],
      ['#7700cc','#aa44ff','#440088'],
      ['#007788','#00bbdd','#003344'],
      ['#cc3300','#ff6633','#882200'],
      ['#224488','#3366cc','#0a1f44']
    ];
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    return palettes[Math.abs(hash) % palettes.length];
  }

  /** Generate street graffiti art style SVG logo from team name */
  function _teamLogo(name) {
    var palettes = [
      ['#cc0000','#ff4444','#660000'],
      ['#1144cc','#4488ff','#082288'],
      ['#118800','#44cc00','#065500'],
      ['#cc6600','#ff9900','#883300'],
      ['#7700cc','#aa44ff','#440088'],
      ['#007788','#00bbdd','#003344'],
      ['#cc3300','#ff6633','#882200'],
      ['#224488','#3366cc','#0a1f44']
    ];
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    var h = Math.abs(hash);
    var p = palettes[h % palettes.length];
    var style = h % 8;
    var gid = 'tlg' + (h % 99991);
    var words = name.trim().split(/\s+/);
    var initials = words.slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase() || '?';
    var initSize = initials.length > 1 ? '28' : '36';
    var ty = '46';
    var bg = '', extras = '';

    if (style === 0) {
      // Spray Burst: radial rays + dot halo around circle
      var rays = '';
      for (var r = 0; r < 16; r++) {
        var ang = r * 22.5 * Math.PI / 180;
        var rx1 = Math.round((40 + 16 * Math.cos(ang)) * 10) / 10;
        var ry1 = Math.round((40 + 16 * Math.sin(ang)) * 10) / 10;
        var rx2 = Math.round((40 + 37 * Math.cos(ang)) * 10) / 10;
        var ry2 = Math.round((40 + 37 * Math.sin(ang)) * 10) / 10;
        rays += '<line x1="' + rx1 + '" y1="' + ry1 + '" x2="' + rx2 + '" y2="' + ry2 + '" stroke="' + p[0] + '" stroke-width="' + (r%2===0?'4':'2') + '" opacity=".55"/>';
      }
      var sprayDots = '';
      var dAngles = [0,23,47,68,91,112,135,158,180,203,226,248,270,293,315,337];
      for (var d = 0; d < dAngles.length; d++) {
        var da = dAngles[d] * Math.PI / 180;
        var dr = 33 + (d % 4) - 2;
        sprayDots += '<circle cx="' + Math.round((40+dr*Math.cos(da))*10)/10 + '" cy="' + Math.round((40+dr*Math.sin(da))*10)/10 + '" r="' + (0.7+(d%3)*0.5) + '" fill="rgba(255,255,255,.45)"/>';
      }
      bg = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>' + rays + sprayDots;
      extras = '<circle cx="40" cy="40" r="17" fill="' + p[2] + '"/>'
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="' + p[1] + '" stroke-width="2.5" stroke-dasharray="5,4"/>';
    } else if (style === 1) {
      // 3D Block: dark rect + bottom accent bar + corner diamond stars
      bg = '<rect x="3" y="3" width="74" height="74" rx="3" fill="#0d0d0d"/>';
      extras = '<rect x="3" y="57" width="74" height="8" fill="' + p[2] + '"/>'
        + '<rect x="3" y="3" width="74" height="74" rx="3" fill="none" stroke="' + p[1] + '" stroke-width="3.5"/>'
        + '<rect x="9" y="9" width="62" height="62" rx="2" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1"/>'
        + '<polygon points="8,8 10,5 12,8 10,11" fill="' + p[1] + '"/>'
        + '<polygon points="68,8 70,5 72,8 70,11" fill="' + p[1] + '"/>'
        + '<polygon points="8,68 10,65 12,68 10,71" fill="' + p[1] + '"/>'
        + '<polygon points="68,68 70,65 72,68 70,71" fill="' + p[1] + '"/>';
      ty = '40';
    } else if (style === 2) {
      // Crown Spikes: spiky crown silhouette pointing up
      bg = '<path d="M4,76 L4,40 L18,22 L30,40 L40,18 L50,40 L62,22 L76,40 L76,76 Z" fill="#0d0d0d"/>';
      extras = '<path d="M4,76 L4,40 L18,22 L30,40 L40,18 L50,40 L62,22 L76,40 L76,76 Z" fill="none" stroke="' + p[1] + '" stroke-width="3"/>'
        + '<path d="M8,76 L8,44 L20,28 L31,44 L40,25 L49,44 L60,28 L72,44 L72,76 Z" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"/>'
        + '<circle cx="18" cy="22" r="3.5" fill="' + p[1] + '"/>'
        + '<circle cx="40" cy="18" r="4.5" fill="' + p[1] + '"/>'
        + '<circle cx="62" cy="22" r="3.5" fill="' + p[1] + '"/>';
      ty = '56';
    } else if (style === 3) {
      // Drip Tag: rectangle + paint drips hanging from bottom
      bg = '<rect x="4" y="6" width="72" height="52" rx="5" fill="#0d0d0d"/>';
      var drips = '';
      var dxArr = [12,20,28,36,44,52,60,68];
      var dhArr = [18,11,22,15,20,13,17,10];
      for (var dp = 0; dp < dxArr.length; dp++) {
        var ddx = dxArr[dp];
        var ddh = dhArr[(dp + (h % 5)) % dhArr.length];
        drips += '<rect x="' + (ddx-2.5) + '" y="58" width="5" height="' + ddh + '" fill="' + p[0] + '" rx="2.5"/>';
        drips += '<circle cx="' + ddx + '" cy="' + (58+ddh) + '" r="3.5" fill="' + p[0] + '"/>';
      }
      extras = drips
        + '<rect x="4" y="6" width="72" height="52" rx="5" fill="none" stroke="' + p[1] + '" stroke-width="3"/>'
        + '<rect x="9" y="11" width="62" height="42" rx="3" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1.5"/>';
      ty = '33';
    } else if (style === 4) {
      // Sticker Bomb: thick-border rounded rect + scanlines + corner stars
      bg = '<rect x="3" y="3" width="74" height="74" rx="10" fill="#0d0d0d"/>';
      var scanlines = '';
      for (var sl = 10; sl < 76; sl += 5) {
        scanlines += '<line x1="3" y1="' + sl + '" x2="77" y2="' + sl + '" stroke="rgba(255,255,255,.03)" stroke-width="2"/>';
      }
      extras = scanlines
        + '<rect x="3" y="3" width="74" height="74" rx="10" fill="none" stroke="#000" stroke-width="8"/>'
        + '<rect x="3" y="3" width="74" height="74" rx="10" fill="none" stroke="' + p[1] + '" stroke-width="4"/>'
        + '<rect x="12" y="12" width="56" height="56" rx="6" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1.5"/>'
        + '<polygon points="12,12 15,8 18,12 15,16" fill="' + p[1] + '"/>'
        + '<polygon points="62,12 65,8 68,12 65,16" fill="' + p[1] + '"/>'
        + '<polygon points="12,62 15,58 18,62 15,66" fill="' + p[1] + '"/>'
        + '<polygon points="62,62 65,58 68,62 65,66" fill="' + p[1] + '"/>';
    } else if (style === 5) {
      // Circle Tag: dark circle + color fill + spray dot halo
      bg = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>'
        + '<circle cx="40" cy="40" r="32" fill="' + p[2] + '"/>';
      var haloDots = '';
      var haloAng = [0,30,60,90,120,150,180,210,240,270,300,330];
      for (var ha = 0; ha < haloAng.length; ha++) {
        var haRad = haloAng[ha] * Math.PI / 180;
        haloDots += '<circle cx="' + Math.round((40+35.5*Math.cos(haRad))*10)/10 + '" cy="' + Math.round((40+35.5*Math.sin(haRad))*10)/10 + '" r="' + (ha%3===0?'2':'1.2') + '" fill="' + p[1] + '" opacity=".7"/>';
        var saOff = 15 * Math.PI / 180;
        haloDots += '<circle cx="' + Math.round((40+37*Math.cos(haRad+saOff))*10)/10 + '" cy="' + Math.round((40+37*Math.sin(haRad+saOff))*10)/10 + '" r="0.7" fill="rgba(255,255,255,.4)"/>';
      }
      extras = haloDots
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="' + p[1] + '" stroke-width="2.5"/>'
        + '<circle cx="40" cy="40" r="26" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/>';
    } else if (style === 6) {
      // Arrow Banner: left-chevron banner shape + tip dot
      bg = '<path d="M4,20 L62,20 L76,40 L62,60 L4,60 Z" fill="#0d0d0d"/>';
      extras = '<path d="M4,20 L62,20 L76,40 L62,60 L4,60 Z" fill="none" stroke="' + p[1] + '" stroke-width="3"/>'
        + '<path d="M8,25 L60,25 L71,40 L60,55 L8,55 Z" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"/>'
        + '<circle cx="76" cy="40" r="5" fill="' + p[1] + '"/>'
        + '<circle cx="76" cy="40" r="2.5" fill="#fff" opacity=".8"/>'
        + '<circle cx="4" cy="40" r="4" fill="' + p[0] + '"/>';
      ty = '44';
    } else {
      // Style 7: Chrome Pill + metallic highlight arc
      bg = '<ellipse cx="40" cy="40" rx="37" ry="33" fill="#0d0d0d"/>'
        + '<ellipse cx="40" cy="40" rx="33" ry="29" fill="' + p[2] + '"/>';
      extras = '<ellipse cx="40" cy="40" rx="37" ry="33" fill="none" stroke="' + p[1] + '" stroke-width="3"/>'
        + '<ellipse cx="40" cy="26" rx="22" ry="7" fill="rgba(255,255,255,.12)"/>'
        + '<ellipse cx="40" cy="40" rx="26" ry="22" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"/>';
    }

    // Graffiti text: 4 layered strokes for street art 3D depth + italic bold
    var tya = (parseInt(ty) + 4).toString();
    var tf = 'Impact,Arial Black,Oswald,sans-serif';
    var txt = '<text x="44" y="' + tya + '" text-anchor="middle" dominant-baseline="middle" font-family="' + tf + '" font-size="' + initSize + '" font-weight="900" font-style="italic" fill="rgba(0,0,0,.9)" stroke="rgba(0,0,0,.9)" stroke-width="8" stroke-linejoin="round" paint-order="stroke">' + initials + '</text>'
      + '<text x="40" y="' + ty + '" text-anchor="middle" dominant-baseline="middle" font-family="' + tf + '" font-size="' + initSize + '" font-weight="900" font-style="italic" fill="' + p[0] + '" stroke="#000" stroke-width="6" stroke-linejoin="round" paint-order="stroke">' + initials + '</text>'
      + '<text x="40" y="' + ty + '" text-anchor="middle" dominant-baseline="middle" font-family="' + tf + '" font-size="' + initSize + '" font-weight="900" font-style="italic" fill="' + p[1] + '">' + initials + '</text>'
      + '<text x="40" y="' + ty + '" text-anchor="middle" dominant-baseline="middle" font-family="' + tf + '" font-size="' + initSize + '" font-weight="900" font-style="italic" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.5">' + initials + '</text>';
    return '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">'
      + bg + extras + txt + '</svg>';
  }

  /** Render a single match VS card (large, for the coming-matches section) */
  function renderComingMatchCard(game) {
    var homeName = game.homeTeamName || game.homeTeamId || '—';
    var awayName = game.awayTeamName || game.awayTeamId || '—';
    var date = _formatDate(game.date);
    var time = _formatTime(game.time);
    var venue = game.venue || '';
    var homeLogo = _teamLogo(homeName);
    var awayLogo = _teamLogo(awayName);
    var homeP = _teamPalette(homeName);
    var awayP = _teamPalette(awayName);
    var homeBg = 'linear-gradient(135deg,' + homeP[2] + ' 0%,rgba(0,0,0,.88) 100%)';
    var awayBg = 'linear-gradient(225deg,' + awayP[2] + ' 0%,rgba(0,0,0,.88) 100%)';
    var html = '<div class="cm-card">';
    html += '<div class="cm-split">';
    html += '<div class="cm-home" style="background:' + homeBg + '">';
    html += '<div class="cm-logo">' + homeLogo + '</div>';
    html += '<div class="cm-name">' + escapeHtml(homeName) + '</div>';
    html += '</div>';
    // VS badge
    html += '<div class="cm-vs-wrap">';
    html += '<div class="cm-vs-badge">';
    html += '<svg class="cm-vs-bg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><polygon points="50,2 95,28 95,72 50,98 5,72 5,28" fill="#111"/><polygon points="50,2 95,28 95,72 50,98 5,72 5,28" fill="none" stroke="#cc0000" stroke-width="3"/></svg>';
    html += '<span class="cm-vs-text">VS</span>';
    html += '</div></div>';
    html += '<div class="cm-away" style="background:' + awayBg + '">';
    html += '<div class="cm-logo">' + awayLogo + '</div>';
    html += '<div class="cm-name">' + escapeHtml(awayName) + '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="cm-info">';
    if (date) html += '<div class="cm-info-item"><span class="cm-info-icon">📅</span><span>' + escapeHtml(date + (time ? ' ' + time : '')) + '</span></div>';
    if (venue) html += '<div class="cm-info-item"><span class="cm-info-icon">📍</span><span>' + escapeHtml(venue) + '</span></div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // --- 即將進行的賽程（需求 3.2）---
  function loadUpcomingGames() {
    if (!upcomingGamesEl) return;
    upcomingGamesEl.innerHTML = '<div class="loading" data-i18n="common.loading">' + I18n.t('common.loading') + '</div>';

    var comingEl = document.getElementById('coming-matches-list');

    Promise.all([
      API.getSchedule(currentSeasonId),
      API.getTeams(currentSeasonId)
    ])
      .then(function (results) {
        var games = results[0];
        var teams = results[1] || [];

        // Build team map for jersey colors and name resolution
        _teamsMap = {};
        teams.forEach(function (t) { _teamsMap[t.id] = t; });

        if (!games || games.length === 0) {
          upcomingGamesEl.innerHTML = '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';
          if (comingEl) comingEl.innerHTML = '<p class="text-muted">' + I18n.t('common.noData') + '</p>';
          return;
        }

        // Resolve team names and attach jersey colors
        games.forEach(function (g) {
          var ht = _teamsMap[g.homeTeamId];
          var at = _teamsMap[g.awayTeamId];
          if (!g.homeTeamName && ht) g.homeTeamName = ht.name || '';
          if (!g.awayTeamName && at) g.awayTeamName = at.name || '';
          g._homeJersey = ht ? (ht.jerseyHome || '') : '';
          g._awayJersey = at ? (at.jerseyAway || '') : '';
        });

        // 篩選未完成比賽，按日期升序，取最近 6 場
        var upcoming = games.filter(function (g) { return g.status === 'scheduled'; });
        upcoming.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
        var next = upcoming.slice(0, 6);

        if (next.length === 0) {
          upcomingGamesEl.innerHTML = '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';
          if (comingEl) comingEl.innerHTML = '<p class="text-muted">暫無賽事</p>';
          return;
        }

        // Render coming matches section with all upcoming games
        if (comingEl) {
          comingEl.innerHTML = next.map(renderComingMatchCard).join('');
          // Update hero meta with first game date
          var firstGame = next[0];
          var metaEl = document.getElementById('hero-meta-text');
          if (metaEl && firstGame.date) {
            metaEl.textContent = _formatDate(firstGame.date) + ' · Season 1 · Hong Kong';
          }
        }

        // Keep hidden upcoming-games-list populated for compatibility
        upcomingGamesEl.innerHTML = next.map(renderUpcomingCard).join('');
      })
      .catch(function () {
        upcomingGamesEl.innerHTML = '<p class="text-muted">' + I18n.t('error.loadFailed') + ' <button class="btn btn-outline btn-sm" onclick="location.reload()">' + I18n.t('common.retry') + '</button></p>';
      });
  }

  /**
   * 渲染即將進行的賽程卡片（含球衣顏色）
   */
  function renderUpcomingCard(game) {
    var homeName = game.homeTeamName || game.home || game.homeTeamId || '—';
    var awayName = game.awayTeamName || game.away || game.awayTeamId || '—';
    var date = _formatDate(game.date);
    var time = _formatTime(game.time);
    var venue = game.venue || '';

    // Jersey color swatches
    var homeJerseyHtml = _jerseyBadge(game._homeJersey);
    var awayJerseyHtml = _jerseyBadge(game._awayJersey);

    var html = '<div class="game-card game-card--upcoming">';
    html += '<div class="game-card-date text-muted">' + escapeHtml(date) + (time ? ' ' + escapeHtml(time) : '') + '</div>';
    html += '<div class="game-card-matchup">';
    html += '<span class="game-card-team">' + escapeHtml(homeName) + homeJerseyHtml + '</span>';
    html += '<span class="game-card-vs">' + I18n.t('common.vs') + '</span>';
    html += '<span class="game-card-team">' + escapeHtml(awayName) + awayJerseyHtml + '</span>';
    html += '</div>';
    if (venue) {
      html += '<div class="game-card-venue text-muted">📍 ' + escapeHtml(venue) + '</div>';
    }
    html += '</div>';
    return html;
  }

  /**
   * Generate jersey color badge HTML (swatch only)
   */
  function _jerseyBadge(color) {
    if (!color) return '';
    var bg = _jerseyColor(color);
    if (bg === 'transparent') return '';
    var border = (bg === '#ffffff' || bg === '#cbd5e0' || bg === '#ecc94b')
      ? 'border:1px solid rgba(0,0,0,0.3);' : 'border:1px solid rgba(255,255,255,0.2);';
    return ' <span class="jersey-badge" title="' + escapeHtml(color) + '" style="background-color:' + bg + ';' + border + '"></span>';
  }

  /**
   * Map color names/hex to CSS color
   */
  function _jerseyColor(color) {
    if (!color) return 'transparent';
    var map = {
      '白色': '#ffffff', '白': '#ffffff',
      '黑色': '#222222', '黑': '#222222',
      '紅色': '#e53e3e', '紅': '#e53e3e',
      '藍色': '#3182ce', '藍': '#3182ce',
      '綠色': '#38a169', '綠': '#38a169',
      '黃色': '#ecc94b', '黃': '#ecc94b',
      '橙色': '#ed8936', '橙': '#ed8936',
      '紫色': '#805ad5', '紫': '#805ad5',
      '灰色': '#a0aec0', '灰': '#a0aec0',
      '深藍': '#1a365d', '淺藍': '#63b3ed',
      '深紅': '#9b2c2c', '粉紅': '#ed64a6', '粉紅色': '#ed64a6',
      '金色': '#d69e2e', '銀色': '#cbd5e0'
    };
    return map[color] || (color.charAt(0) === '#' ? color : 'transparent');
  }

  // --- 聯賽公告（需求 3.3）---
  function loadAnnouncements() {
    if (!announcementsEl) return;
    announcementsEl.innerHTML = '<div class="loading" data-i18n="common.loading">' + I18n.t('common.loading') + '</div>';

    API.getAnnouncements()
      .then(function (announcements) {
        if (!announcements || announcements.length === 0) {
          announcementsEl.innerHTML = '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';
          return;
        }
        // Filter out hidden announcements
        var visible = announcements.filter(function (a) {
          return a.hidden !== true && a.hidden !== 'true';
        });
        if (visible.length === 0) {
          announcementsEl.innerHTML = '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';
          return;
        }
        // 取最近 5 則公告
        var recent = visible.slice(0, 5);
        announcementsEl.innerHTML = recent.map(renderAnnouncement).join('');
      })
      .catch(function () {
        announcementsEl.innerHTML = '<p class="text-muted">' + I18n.t('error.loadFailed') + ' <button class="btn btn-outline btn-sm" onclick="location.reload()">' + I18n.t('common.retry') + '</button></p>';
      });
  }

  /**
   * 渲染公告項目
   */
  function renderAnnouncement(item) {
    var html = '<div class="announcement-item';
    if (item.pinned === true || item.pinned === 'true') html += ' announcement-item--pinned';
    html += '">';
    if (item.pinned === true || item.pinned === 'true') {
      html += '<span class="announcement-pin">📌</span>';
    }
    html += '<div class="announcement-date">' + escapeHtml(Utils.formatDateWithDay(item.date)) + '</div>';
    html += '<div class="announcement-title">' + escapeHtml(item.title || '') + '</div>';
    if (item.photo) {
      html += '<div class="announcement-photo"><img src="' + escapeHtml(item.photo) + '" alt="" loading="lazy"></div>';
    }
    if (item.content) {
      // Preserve line breaks from the editor
      html += '<div class="announcement-content">' + escapeHtml(item.content).replace(/\n/g, '<br>') + '</div>';
    }
    // WhatsApp share button
    var waMsg = '📢 *ALL-IN Basketball League*\n\n';
    waMsg += '*' + (item.title || '') + '*\n';
    if (item.content) waMsg += item.content + '\n';
    waMsg += '\n🔗 https://www.aiblhk.com';
    var waUrl = 'https://wa.me/?text=' + encodeURIComponent(waMsg);
    html += '<div class="announcement-actions">';
    html += '<a href="' + waUrl + '" target="_blank" rel="noopener" class="announcement-share-btn" aria-label="WhatsApp 分享">📱 分享</a>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // --- 球隊排名（需求 3.5）— 從比賽結果前端計算，確保與節分一致 ---
  function loadStandings() {
    if (!standingsBody) return;
    standingsBody.innerHTML = '<tr><td colspan="8" class="loading" data-i18n="common.loading">' + I18n.t('common.loading') + '</td></tr>';

    Promise.all([
      API.getGames(currentSeasonId),
      API.getTeams(currentSeasonId)
    ]).then(function (results) {
      var games = results[0] || [];
      var teams = results[1] || [];

      if (teams.length === 0) {
        standingsBody.innerHTML = '<tr><td colspan="8" class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</td></tr>';
        return;
      }

      var standings = _computeStandings(games, teams);
      if (standings.length === 0) {
        standingsBody.innerHTML = '<tr><td colspan="8" class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</td></tr>';
        return;
      }

      var top8 = standings.slice(0, 8);
      standingsBody.innerHTML = top8.map(function (team, idx) {
        return renderStandingRow(team, idx + 1);
      }).join('');
    }).catch(function () {
      standingsBody.innerHTML = '<tr><td colspan="8" class="text-muted">' + I18n.t('error.loadFailed') + '</td></tr>';
    });
  }

  /**
   * 從比賽數據計算球隊積分榜（節分優先）
   * 積分制：勝3分 / 和2分 / 負1分 / 棄權0分
   * 同分排名：對賽往績積分 → 對賽往績得失 → 全組得失球差
   */
  function _computeStandings(games, teams) {
    var table = {};
    teams.forEach(function (t) {
      table[t.id] = {
        id: t.id,
        teamName: t.name || t.teamName || t.id,
        played: 0, wins: 0, draws: 0, losses: 0, forfeits: 0,
        pointsFor: 0, pointsAgainst: 0, diff: 0, points: 0
      };
    });

    var allResults = []; // stored for h2h tiebreaker

    games.forEach(function (g) {
      if (g.status !== 'completed') return;
      if (!table[g.homeTeamId] || !table[g.awayTeamId]) return;

      var hasQuarters = g.homeQ1 || g.homeQ2 || g.homeQ3 || g.homeQ4 ||
                        g.awayQ1 || g.awayQ2 || g.awayQ3 || g.awayQ4;
      var homeScore, awayScore;
      if (hasQuarters) {
        homeScore = (parseInt(g.homeQ1, 10) || 0) + (parseInt(g.homeQ2, 10) || 0) +
                    (parseInt(g.homeQ3, 10) || 0) + (parseInt(g.homeQ4, 10) || 0);
        awayScore = (parseInt(g.awayQ1, 10) || 0) + (parseInt(g.awayQ2, 10) || 0) +
                    (parseInt(g.awayQ3, 10) || 0) + (parseInt(g.awayQ4, 10) || 0);
      } else {
        homeScore = parseInt(g.homeScore, 10) || 0;
        awayScore = parseInt(g.awayScore, 10) || 0;
      }

      // Forfeit detection (backend may set g.forfeit = 'home'/'away' or g.walkover)
      var forfeitSide = g.forfeit || g.walkover || '';
      var isForfeit = forfeitSide === 'home' || forfeitSide === 'away';

      allResults.push({
        homeId: g.homeTeamId, awayId: g.awayTeamId,
        homeScore: homeScore, awayScore: awayScore,
        isForfeit: isForfeit, forfeitSide: forfeitSide
      });

      table[g.homeTeamId].played++;
      table[g.awayTeamId].played++;
      table[g.homeTeamId].pointsFor += homeScore;
      table[g.homeTeamId].pointsAgainst += awayScore;
      table[g.awayTeamId].pointsFor += awayScore;
      table[g.awayTeamId].pointsAgainst += homeScore;

      if (isForfeit) {
        // Forfeiting side gets 0 pts; winner gets 3 pts
        if (forfeitSide === 'home') {
          table[g.awayTeamId].wins++;   table[g.awayTeamId].points += 3;
          table[g.homeTeamId].forfeits++; // 0 pts
        } else {
          table[g.homeTeamId].wins++;   table[g.homeTeamId].points += 3;
          table[g.awayTeamId].forfeits++; // 0 pts
        }
      } else if (homeScore > awayScore) {
        table[g.homeTeamId].wins++;   table[g.homeTeamId].points += 3;
        table[g.awayTeamId].losses++; table[g.awayTeamId].points += 1;
      } else if (awayScore > homeScore) {
        table[g.awayTeamId].wins++;   table[g.awayTeamId].points += 3;
        table[g.homeTeamId].losses++; table[g.homeTeamId].points += 1;
      } else {
        table[g.homeTeamId].draws++; table[g.homeTeamId].points += 2;
        table[g.awayTeamId].draws++; table[g.awayTeamId].points += 2;
      }
    });

    var rows = Object.keys(table).map(function (id) {
      var t = table[id];
      t.diff = t.pointsFor - t.pointsAgainst;
      return t;
    });

    return _sortStandings(rows, allResults);
  }

  /**
   * 排名排序：積分 → 對賽往績（積分/得失）→ 全組得失球差
   */
  function _sortStandings(rows, allResults) {
    rows.sort(function (a, b) { return b.points - a.points; });
    var out = [], i = 0;
    while (i < rows.length) {
      var j = i;
      while (j < rows.length && rows[j].points === rows[i].points) j++;
      var group = rows.slice(i, j);
      if (group.length > 1) group = _resolveH2H(group, allResults);
      out = out.concat(group);
      i = j;
    }
    return out;
  }

  function _resolveH2H(group, allResults) {
    if (group.length === 1) return group;
    var ids = {};
    group.forEach(function (t) { ids[t.id] = true; });
    // Only games between the tied teams
    var h2hGames = allResults.filter(function (g) { return ids[g.homeId] && ids[g.awayId]; });
    var h2h = {};
    group.forEach(function (t) { h2h[t.id] = { points: 0, diff: 0 }; });
    h2hGames.forEach(function (g) {
      if (g.isForfeit) {
        if (g.forfeitSide === 'home') { h2h[g.awayId].points += 3; }
        else { h2h[g.homeId].points += 3; }
      } else if (g.homeScore > g.awayScore) {
        h2h[g.homeId].points += 3; h2h[g.awayId].points += 1;
      } else if (g.awayScore > g.homeScore) {
        h2h[g.awayId].points += 3; h2h[g.homeId].points += 1;
      } else {
        h2h[g.homeId].points += 2; h2h[g.awayId].points += 2;
      }
      h2h[g.homeId].diff += (g.homeScore - g.awayScore);
      h2h[g.awayId].diff += (g.awayScore - g.homeScore);
    });
    group.sort(function (a, b) {
      var ha = h2h[a.id], hb = h2h[b.id];
      if (hb.points !== ha.points) return hb.points - ha.points; // h2h 積分
      if (hb.diff   !== ha.diff)   return hb.diff   - ha.diff;   // h2h 得失
      return b.diff - a.diff;                                     // 全組得失球差
    });
    return group;
  }

  /**
   * 渲染排名表行
   */
  function renderStandingRow(team, rank) {
    var name = team.teamName || team.team || team.name || '—';
    var played = team.played != null ? team.played : 0;
    var wins = team.wins != null ? team.wins : 0;
    var draws = team.draws != null ? team.draws : 0;
    var losses = team.losses != null ? team.losses : 0;
    var points = team.points != null ? team.points : 0;
    var diff = team.diff != null ? (team.diff > 0 ? '+' + team.diff : team.diff) : '0';

    return '<tr>' +
      '<td>' + rank + '</td>' +
      '<td>' + escapeHtml(name) + '</td>' +
      '<td>' + played + '</td>' +
      '<td>' + wins + '</td>' +
      '<td>' + draws + '</td>' +
      '<td>' + losses + '</td>' +
      '<td>' + diff + '</td>' +
      '<td class="text-accent">' + points + '</td>' +
      '</tr>';
  }

  // --- 最近成就（需求 15.6）---
  function loadRecentAchievements() {
    if (!achievementsEl) return;
    achievementsEl.innerHTML = '<div class="loading" data-i18n="common.loading">' + I18n.t('common.loading') + '</div>';

    // 成就 API 需要 playerId，但儀表板需要全局最近成就
    // 嘗試用不帶 playerId 的方式取得全局成就，若 API 不支援則顯示空
    API.get('recentAchievements', { seasonId: currentSeasonId })
      .then(function (achievements) {
        if (!achievements || achievements.length === 0) {
          achievementsEl.innerHTML = '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';
          return;
        }
        var recent5 = achievements.slice(0, 5);
        achievementsEl.innerHTML = recent5.map(renderAchievement).join('');
      })
      .catch(function () {
        // 若 recentAchievements 端點不存在，靜默顯示空
        achievementsEl.innerHTML = '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';
      });
  }

  /**
   * 渲染成就項目
   */
  function renderAchievement(ach) {
    var typeKey = 'achievement.' + (ach.type || '');
    var typeName = I18n.t(typeKey);
    if (typeName === typeKey) typeName = ach.type || '';
    var playerName = ach.playerName || ach.playerId || '';
    var date = Utils.formatDateWithDay(ach.date);

    var html = '<div class="achievement-item">';
    html += '<div class="achievement-badge" aria-hidden="true">🏆</div>';
    html += '<div class="achievement-info">';
    html += '<div class="achievement-name">' + escapeHtml(playerName) + ' — ' + escapeHtml(typeName) + '</div>';
    html += '<div class="achievement-date text-muted">' + escapeHtml(date) + '</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // --- 全部顯示空狀態 ---
  function showEmptyAll() {
    var noData = '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';
    if (recentGamesEl) recentGamesEl.innerHTML = noData;
    if (upcomingGamesEl) upcomingGamesEl.innerHTML = noData;
    if (announcementsEl) announcementsEl.innerHTML = noData;
    if (standingsBody) standingsBody.innerHTML = '<tr><td colspan="6" class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</td></tr>';
    if (achievementsEl) achievementsEl.innerHTML = noData;
  }

  // --- HTML 轉義 ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- 頁面載入後初始化 ---
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
