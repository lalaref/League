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
  var homeLeaderboardsEl = document.getElementById('home-leaderboards-list');
  var achievementsEl = document.getElementById('achievements-list');
  var seasonStatsEls = {
    teams: document.getElementById('cb-teams-count'),
    games: document.getElementById('cb-games-played'),
    players: document.getElementById('cb-players-count'),
    season: document.getElementById('cb-season-label')
  };

  // --- 首頁資料賽季 ID（Season 1 未完結時保留 Season 1 資料） ---
  var currentSeasonId = null;
  var currentSeason = null;
  var homeDisplaySeasons = [];

  /**
   * 格式化日期：使用全局 Utils
   */
  function _formatDate(raw) { return Utils.formatDateWithDay(raw); }

  /**
   * 格式化時間：使用全局 Utils
   */
  function _formatTime(raw) { return Utils.formatTime(raw); }

  function todayYmd() {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
  }

  // --- 初始化 ---
  function init() {
    loadCurrentSeason();
  }

  /**
   * 載入當前活躍賽季，然後載入所有儀表板數據
   */
  function loadCurrentSeason(retryCount) {
    retryCount = retryCount || 0;
    var comingEl = document.getElementById('coming-matches-list');
    API.getSeasons()
      .then(function (seasons) {
        if (!seasons || seasons.length === 0) {
          showEmptyAll();
          return;
        }
        homeDisplaySeasons = getHomeDisplaySeasons(seasons);
        var active = selectHomeDataSeason(seasons);
        currentSeason = active;
        currentSeasonId = active.id;

        // 並行載入所有數據
        loadSeasonSummary(homeDisplaySeasons, active);
        loadRecentGames();
        loadUpcomingGames(homeDisplaySeasons);
        loadAnnouncements();
        loadStandings(homeDisplaySeasons);
        loadHomeLeaderboards(homeDisplaySeasons);
        loadRecentAchievements();
      })
      .catch(function () {
        if (retryCount < 2) {
          // Retry after delay (mobile cold start can be slow)
          var delay = (retryCount + 1) * 5000;
          if (comingEl) comingEl.innerHTML = '<div style="color:#aaa;text-align:center;padding:40px 0;font-size:13px">正在重新連線... (' + (retryCount + 1) + '/2)</div>';
          setTimeout(function () { loadCurrentSeason(retryCount + 1); }, delay);
        } else {
          showEmptyAll();
          if (comingEl) comingEl.innerHTML = '<div style="color:#aaa;text-align:center;padding:40px 0;font-size:13px">暫時無法載入資料<br><button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;background:#cc0000;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">重新載入</button></div>';
        }
      });
  }

  function selectHomeDataSeason(seasons) {
    var list = seasons || [];
    for (var i = 0; i < list.length; i++) {
      if (isActiveSeason(list[i]) && isSeasonOne(list[i])) return list[i];
    }
    for (var j = list.length - 1; j >= 0; j--) {
      if (isActiveSeason(list[j])) return list[j];
    }
    return list[list.length - 1];
  }

  function getHomeDisplaySeasons(seasons) {
    var list = seasons || [];
    var seasonOne = null;
    var seasonTwo = null;
    list.forEach(function (season) {
      if (!season || !season.id) return;
      if (!seasonOne && isSeasonOne(season)) seasonOne = season;
      if (!seasonTwo && isSeasonTwo(season)) seasonTwo = season;
    });
    var selected = [];
    if (seasonOne) selected.push(seasonOne);
    if (seasonTwo && (!seasonOne || seasonTwo.id !== seasonOne.id)) selected.push(seasonTwo);
    if (selected.length === 0) {
      selected = list.filter(isActiveSeason);
    }
    if (selected.length === 0 && list.length) selected.push(list[list.length - 1]);
    selected.sort(function (a, b) { return getSeasonSortNumber(a) - getSeasonSortNumber(b); });
    return selected;
  }

  function isActiveSeason(season) {
    return season && String(season.status || '').toLowerCase() === 'active';
  }

  function isSeasonOne(season) {
    if (!season) return false;
    var name = String(season.name || season.id || '').toLowerCase();
    return season.id === '845ca40d-4346-448f-bbe2-06b4104bdbda'
      || /season\s*1/.test(name)
      || name.indexOf('第一') !== -1
      || String(season.minGamesForRanking || '') === '7';
  }

  function isSeasonTwo(season) {
    if (!season) return false;
    var name = String(season.name || season.id || '').toLowerCase();
    return season.id === 'c90f2419-8111-43ef-9506-a2d082426b75'
      || /season\s*2/.test(name)
      || /\bs\s*2\b/.test(name)
      || name.indexOf('第二') !== -1
      || String(season.minGamesForRanking || '') === '5';
  }

  function loadSeasonSummary(seasons, fallbackSeason) {
    if (!seasonStatsEls.teams && !seasonStatsEls.games && !seasonStatsEls.players && !seasonStatsEls.season) return;

    var includedSeasons = getSummarySeasons(seasons, fallbackSeason);

    setSeasonStat(seasonStatsEls.teams, '—');
    setSeasonStat(seasonStatsEls.games, '—');
    setSeasonStat(seasonStatsEls.players, '—');
    setSeasonStat(seasonStatsEls.season, formatSeasonRange(includedSeasons));

    var requests = [];
    includedSeasons.forEach(function (season) {
      requests.push(API.getTeams(season.id));
      requests.push(API.getGames(season.id));
    });
    requests.push(API.getPlayers());

    Promise.all(requests).then(function (results) {
      var teams = [];
      var games = [];
      for (var i = 0; i < includedSeasons.length; i++) {
        teams = teams.concat(results[i * 2] || []);
        games = games.concat(results[i * 2 + 1] || []);
      }
      var players = results[results.length - 1] || [];
      var activeTeamIds = {};

      teams.forEach(function (team) {
        if (team && team.id) activeTeamIds[String(team.id)] = true;
      });

      var completedGames = games.filter(function (game) {
        return game && game.status === 'completed';
      });
      var seasonPlayers = players.filter(function (player) {
        return player && activeTeamIds[String(player.teamId)];
      });

      setSeasonStat(seasonStatsEls.teams, teams.length);
      setSeasonStat(seasonStatsEls.games, completedGames.length);
      setSeasonStat(seasonStatsEls.players, seasonPlayers.length);
      setSeasonStat(seasonStatsEls.season, formatSeasonRange(includedSeasons));
    }).catch(function () {
      setSeasonStat(seasonStatsEls.teams, '—');
      setSeasonStat(seasonStatsEls.games, '—');
      setSeasonStat(seasonStatsEls.players, '—');
      setSeasonStat(seasonStatsEls.season, formatSeasonRange(includedSeasons));
    });
  }

  function getSummarySeasons(seasons, fallbackSeason) {
    var selected = [];
    (seasons || []).forEach(function (season) {
      if (season && season.id && String(season.status || '').toLowerCase() === 'active') selected.push(season);
    });
    if (selected.length === 0 && fallbackSeason) selected.push(fallbackSeason);
    selected.sort(function (a, b) {
      return getSeasonSortNumber(a) - getSeasonSortNumber(b);
    });
    return selected;
  }

  function formatSeasonRange(seasons) {
    if (!seasons || seasons.length === 0) return '—';
    var labels = seasons.map(formatSeasonLabel).filter(function (label) { return label && label !== '—'; });
    return labels.length ? labels.join('+') : '—';
  }

  function getSeasonSortNumber(season) {
    var label = formatSeasonLabel(season);
    var match = label.match(/S(\d+)/i);
    return match ? parseInt(match[1], 10) : 999;
  }

  function setSeasonStat(element, value) {
    if (!element) return;
    element.textContent = value;
  }

  function formatSeasonLabel(season) {
    if (!season) return '—';
    var name = String(season.name || season.id || '').trim();
    var shortMatch = name.match(/S\s*\d+/i);
    if (shortMatch) return shortMatch[0].replace(/\s+/g, '').toUpperCase();
    var seasonMatch = name.match(/Season\s*(\d+)/i);
    if (seasonMatch) return 'S' + seasonMatch[1];
    var zhMatch = name.match(/第\s*([一二三四五六七八九十0-9]+)\s*(屆|季)/);
    if (zhMatch) return 'S' + normalizeSeasonNumber(zhMatch[1]);
    return name || '—';
  }

  function normalizeSeasonNumber(rawValue) {
    if (/^\d+$/.test(rawValue)) return rawValue;
    var numerals = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9
    };
    if (rawValue === '十') return '10';
    if (rawValue.indexOf('十') !== -1) {
      var parts = rawValue.split('十');
      var tens = parts[0] ? numerals[parts[0]] || 0 : 1;
      var ones = parts[1] ? numerals[parts[1]] || 0 : 0;
      return String(tens * 10 + ones);
    }
    return String(numerals[rawValue] || rawValue);
  }

  function renderHomeSeasonBlock(season, meta, bodyHtml) {
    var label = formatSeasonLabel(season);
    var name = season && season.name ? season.name : label;
    return '<div class="home-season-block">'
      + '<div class="home-season-head">'
      + '<div class="home-season-title"><span class="home-season-label">' + escapeHtml(label) + '</span> · <span class="home-season-name">' + escapeHtml(name) + '</span></div>'
      + '<div class="home-season-meta">' + escapeHtml(meta || '') + '</div>'
      + '</div>'
      + bodyHtml
      + '</div>';
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
   * 渲染單場比賽列（一場一行）
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

    var homeWin = Number(homeScore) > Number(awayScore);
    var awayWin = Number(awayScore) > Number(homeScore);
    var date = _formatDate(game.date);
    var url = _pageBase + 'game.html?id=' + encodeURIComponent(game.id);

    return '<a class="gr-row" href="' + url + '" aria-label="' + escapeHtml(homeName) + ' vs ' + escapeHtml(awayName) + '">'
      + '<span class="gr-date">' + escapeHtml(date) + '</span>'
      + '<span class="gr-team gr-team--home' + (homeWin ? ' gr-team--win' : '') + '">' + escapeHtml(homeName) + '</span>'
      + '<span class="gr-score">'
      + '<span class="' + (homeWin ? 'gr-score-win' : '') + '">' + escapeHtml(String(homeScore)) + '</span>'
      + '<span class="gr-score-sep">-</span>'
      + '<span class="' + (awayWin ? 'gr-score-win' : '') + '">' + escapeHtml(String(awayScore)) + '</span>'
      + '</span>'
      + '<span class="gr-team gr-team--away' + (awayWin ? ' gr-team--win' : '') + '">' + escapeHtml(awayName) + '</span>'
      + '</a>';
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

  /** Generate animal mascot SVG logo from team name */
  function _teamLogo(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    var h = Math.abs(hash);
    var p = _teamPalette(name);
    var c = p[0], l = p[1], d = p[2];
    var style = h % 8;
    var inner = '';

    if (style === 0) {
      // WOLF — fierce pointed ears, snout
      inner = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>'
        + '<polygon points="22,40 25,8 36,30" fill="'+c+'"/>'
        + '<polygon points="58,40 55,8 44,30" fill="'+c+'"/>'
        + '<polygon points="24,38 27,14 34,29" fill="'+d+'"/>'
        + '<polygon points="56,38 53,14 46,29" fill="'+d+'"/>'
        + '<ellipse cx="40" cy="46" rx="21" ry="19" fill="'+c+'"/>'
        + '<ellipse cx="40" cy="34" rx="13" ry="8" fill="'+d+'"/>'
        + '<ellipse cx="40" cy="55" rx="11" ry="7" fill="'+d+'"/>'
        + '<ellipse cx="40" cy="49" rx="5" ry="3.5" fill="#111"/>'
        + '<ellipse cx="39" cy="48" rx="1.5" ry="1" fill="rgba(255,255,255,0.3)"/>'
        + '<ellipse cx="30" cy="42" rx="4.5" ry="3.5" fill="'+l+'"/>'
        + '<ellipse cx="30" cy="42" rx="2.5" ry="2.5" fill="#111"/>'
        + '<circle cx="31" cy="41" r="0.8" fill="white"/>'
        + '<ellipse cx="50" cy="42" rx="4.5" ry="3.5" fill="'+l+'"/>'
        + '<ellipse cx="50" cy="42" rx="2.5" ry="2.5" fill="#111"/>'
        + '<circle cx="51" cy="41" r="0.8" fill="white"/>'
        + '<path d="M26,38 L33,36" stroke="#111" stroke-width="2" stroke-linecap="round" opacity="0.7"/>'
        + '<path d="M47,36 L54,38" stroke="#111" stroke-width="2" stroke-linecap="round" opacity="0.7"/>'
        + '<path d="M33,56 Q40,63 47,56" fill="'+c+'" stroke="none"/>'
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="'+l+'" stroke-width="2.5"/>';

    } else if (style === 1) {
      // BULL — wide sweeping horns, square snout, nostrils
      inner = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>'
        + '<path d="M22,40 Q6,22 14,10 Q22,4 28,18" fill="none" stroke="'+c+'" stroke-width="7" stroke-linecap="round"/>'
        + '<path d="M58,40 Q74,22 66,10 Q58,4 52,18" fill="none" stroke="'+c+'" stroke-width="7" stroke-linecap="round"/>'
        + '<rect x="17" y="32" width="46" height="34" rx="8" fill="'+c+'"/>'
        + '<rect x="21" y="32" width="38" height="28" rx="6" fill="'+d+'"/>'
        + '<rect x="26" y="50" width="28" height="18" rx="8" fill="'+c+'" opacity="0.85"/>'
        + '<circle cx="33" cy="60" r="4.5" fill="rgba(0,0,0,0.55)"/>'
        + '<circle cx="47" cy="60" r="4.5" fill="rgba(0,0,0,0.55)"/>'
        + '<circle cx="29" cy="42" r="5" fill="'+l+'"/>'
        + '<circle cx="29" cy="42" r="3" fill="#111"/>'
        + '<circle cx="30" cy="41" r="1" fill="white"/>'
        + '<circle cx="51" cy="42" r="5" fill="'+l+'"/>'
        + '<circle cx="51" cy="42" r="3" fill="#111"/>'
        + '<circle cx="52" cy="41" r="1" fill="white"/>'
        + '<path d="M32,35 Q40,31 48,35" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>'
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="'+l+'" stroke-width="2.5"/>';

    } else if (style === 2) {
      // EAGLE — spread wings, white head cap, hooked beak
      inner = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>'
        + '<path d="M38,44 L4,24 L8,36 L2,40 L10,42 L4,52 L16,48 L18,58 L30,50Z" fill="'+c+'"/>'
        + '<path d="M42,44 L76,24 L72,36 L78,40 L70,42 L76,52 L64,48 L62,58 L50,50Z" fill="'+c+'"/>'
        + '<path d="M38,44 L6,26 L9,33 L4,38 L9,40Z" fill="'+l+'" opacity="0.22"/>'
        + '<path d="M42,44 L74,26 L71,33 L76,38 L71,40Z" fill="'+l+'" opacity="0.22"/>'
        + '<ellipse cx="40" cy="52" rx="14" ry="10" fill="'+c+'"/>'
        + '<circle cx="40" cy="30" r="16" fill="'+c+'"/>'
        + '<ellipse cx="40" cy="23" rx="10" ry="9" fill="'+d+'"/>'
        + '<circle cx="33" cy="28" r="4" fill="'+l+'"/>'
        + '<circle cx="33" cy="28" r="2.5" fill="#111"/>'
        + '<circle cx="34" cy="27" r="0.8" fill="white"/>'
        + '<circle cx="47" cy="28" r="4" fill="'+l+'"/>'
        + '<circle cx="47" cy="28" r="2.5" fill="#111"/>'
        + '<circle cx="48" cy="27" r="0.8" fill="white"/>'
        + '<path d="M29,24 L36,22" stroke="rgba(0,0,0,0.7)" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path d="M44,22 L51,24" stroke="rgba(0,0,0,0.7)" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path d="M34,38 L40,36 L46,38 L44,45 Q40,50 36,45Z" fill="'+l+'"/>'
        + '<line x1="34" y1="42" x2="46" y2="42" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>'
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="'+l+'" stroke-width="2.5"/>';

    } else if (style === 3) {
      // TIGER — round face, stripes, slit pupils, whisker dots
      inner = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>'
        + '<polygon points="22,36 18,12 33,28" fill="'+c+'"/>'
        + '<polygon points="58,36 62,12 47,28" fill="'+c+'"/>'
        + '<polygon points="23,34 20,16 31,27" fill="'+l+'" opacity="0.45"/>'
        + '<polygon points="57,34 60,16 49,27" fill="'+l+'" opacity="0.45"/>'
        + '<circle cx="40" cy="44" r="24" fill="'+c+'"/>'
        + '<ellipse cx="40" cy="30" rx="16" ry="10" fill="'+d+'" opacity="0.65"/>'
        + '<circle cx="27" cy="50" r="9" fill="rgba(255,255,255,0.1)"/>'
        + '<circle cx="53" cy="50" r="9" fill="rgba(255,255,255,0.1)"/>'
        + '<path d="M34,25 Q35,19 37,25 Q36,22 34,25Z" fill="rgba(0,0,0,0.5)"/>'
        + '<path d="M39,23 Q40,18 41,23 Q40,20 39,23Z" fill="rgba(0,0,0,0.5)"/>'
        + '<path d="M43,25 Q44,19 46,25 Q44,22 43,25Z" fill="rgba(0,0,0,0.5)"/>'
        + '<ellipse cx="30" cy="40" rx="5" ry="4.5" fill="'+l+'"/>'
        + '<ellipse cx="30" cy="40" rx="2" ry="4" fill="#111"/>'
        + '<circle cx="31" cy="38.5" r="0.8" fill="white"/>'
        + '<ellipse cx="50" cy="40" rx="5" ry="4.5" fill="'+l+'"/>'
        + '<ellipse cx="50" cy="40" rx="2" ry="4" fill="#111"/>'
        + '<circle cx="51" cy="38.5" r="0.8" fill="white"/>'
        + '<path d="M35,44 L40,42 L45,44 L40,47Z" fill="#111"/>'
        + '<path d="M34,49 Q40,55 46,49" fill="none" stroke="rgba(0,0,0,0.7)" stroke-width="2" stroke-linecap="round"/>'
        + '<path d="M40,47 L40,51" stroke="rgba(0,0,0,0.7)" stroke-width="1.5" stroke-linecap="round"/>'
        + '<circle cx="24" cy="49" r="1.5" fill="rgba(0,0,0,0.45)"/>'
        + '<circle cx="22" cy="52.5" r="1.5" fill="rgba(0,0,0,0.45)"/>'
        + '<circle cx="56" cy="49" r="1.5" fill="rgba(0,0,0,0.45)"/>'
        + '<circle cx="58" cy="52.5" r="1.5" fill="rgba(0,0,0,0.45)"/>'
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="'+l+'" stroke-width="2.5"/>';

    } else if (style === 4) {
      // SHARK — dorsal fin, torpedo body, teeth
      inner = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>'
        + '<ellipse cx="40" cy="50" rx="33" ry="15" fill="'+c+'"/>'
        + '<ellipse cx="40" cy="54" rx="28" ry="9" fill="rgba(255,255,255,0.14)"/>'
        + '<polygon points="36,35 30,8 52,35" fill="'+c+'"/>'
        + '<polygon points="37,35 32,12 50,35" fill="'+d+'" opacity="0.5"/>'
        + '<polygon points="20,50 8,64 24,58" fill="'+d+'"/>'
        + '<polygon points="60,50 72,64 56,58" fill="'+d+'"/>'
        + '<polygon points="6,44 2,34 2,56" fill="'+c+'"/>'
        + '<circle cx="62" cy="46" r="4.5" fill="rgba(255,255,255,0.9)"/>'
        + '<circle cx="62" cy="46" r="2.5" fill="#111"/>'
        + '<circle cx="63" cy="45" r="0.8" fill="white"/>'
        + '<path d="M50,55 Q60,52 70,50" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="2"/>'
        + '<polygon points="51,55 53,62 55,55" fill="white"/>'
        + '<polygon points="55,54 57,61 59,54" fill="white"/>'
        + '<polygon points="59,53 61,59 63,53" fill="white"/>'
        + '<path d="M52,46 Q54,49 52,53" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="1.5" stroke-linecap="round"/>'
        + '<path d="M56,46 Q58,49 56,53" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="1.5" stroke-linecap="round"/>'
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="'+l+'" stroke-width="2.5"/>';

    } else if (style === 5) {
      // DRAGON — horns, scale texture, glowing eyes, fire breath
      inner = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>'
        + '<path d="M28,28 Q18,6 24,2 Q30,6 30,20" fill="'+c+'"/>'
        + '<path d="M52,28 Q62,6 56,2 Q50,6 50,20" fill="'+c+'"/>'
        + '<path d="M16,34 Q16,22 40,20 Q64,22 64,34 Q68,46 52,54 Q40,60 28,54 Q12,46 16,34Z" fill="'+c+'"/>'
        + '<path d="M24,34 Q28,30 32,34" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>'
        + '<path d="M32,34 Q36,30 40,34" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>'
        + '<path d="M40,34 Q44,30 48,34" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>'
        + '<path d="M48,34 Q52,30 56,34" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>'
        + '<path d="M26,42 Q30,38 34,42" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>'
        + '<path d="M34,42 Q38,38 42,42" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>'
        + '<path d="M42,42 Q46,38 50,42" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>'
        + '<ellipse cx="28" cy="36" rx="5.5" ry="4.5" fill="'+l+'"/>'
        + '<ellipse cx="28" cy="36" rx="2" ry="3.5" fill="#111"/>'
        + '<circle cx="29" cy="34.5" r="0.8" fill="white"/>'
        + '<ellipse cx="52" cy="36" rx="5.5" ry="4.5" fill="'+l+'"/>'
        + '<ellipse cx="52" cy="36" rx="2" ry="3.5" fill="#111"/>'
        + '<circle cx="53" cy="34.5" r="0.8" fill="white"/>'
        + '<circle cx="36" cy="48" r="2.5" fill="rgba(0,0,0,0.6)"/>'
        + '<circle cx="44" cy="48" r="2.5" fill="rgba(0,0,0,0.6)"/>'
        + '<path d="M28,56 Q22,64 26,72 Q30,66 28,60Z" fill="#ff6600" opacity="0.9"/>'
        + '<path d="M32,56 Q24,66 28,76 Q34,68 30,62Z" fill="#ff4400" opacity="0.85"/>'
        + '<path d="M30,58 Q26,66 30,72 Q32,68 30,64Z" fill="#ffcc00" opacity="0.85"/>'
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="'+l+'" stroke-width="2.5"/>';

    } else if (style === 6) {
      // BEAR — round head, rounded ears, wide snout
      inner = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>'
        + '<ellipse cx="40" cy="62" rx="28" ry="16" fill="'+c+'"/>'
        + '<circle cx="40" cy="38" r="24" fill="'+c+'"/>'
        + '<circle cx="20" cy="18" r="10" fill="'+c+'"/>'
        + '<circle cx="60" cy="18" r="10" fill="'+c+'"/>'
        + '<circle cx="20" cy="18" r="6" fill="'+d+'"/>'
        + '<circle cx="60" cy="18" r="6" fill="'+d+'"/>'
        + '<ellipse cx="40" cy="46" rx="14" ry="10" fill="'+d+'" opacity="0.7"/>'
        + '<ellipse cx="40" cy="43" rx="6" ry="4.5" fill="#111"/>'
        + '<ellipse cx="39" cy="42" rx="2" ry="1.2" fill="rgba(255,255,255,0.3)"/>'
        + '<path d="M34,48 Q40,54 46,48" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"/>'
        + '<path d="M40,48 L40,52" stroke="#111" stroke-width="2" stroke-linecap="round"/>'
        + '<circle cx="30" cy="34" r="5.5" fill="rgba(255,255,255,0.9)"/>'
        + '<circle cx="30" cy="34" r="3.5" fill="#111"/>'
        + '<circle cx="31" cy="33" r="1" fill="white"/>'
        + '<circle cx="50" cy="34" r="5.5" fill="rgba(255,255,255,0.9)"/>'
        + '<circle cx="50" cy="34" r="3.5" fill="#111"/>'
        + '<circle cx="51" cy="33" r="1" fill="white"/>'
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="'+l+'" stroke-width="2.5"/>';

    } else {
      // LION — jagged mane ring, regal face
      inner = '<circle cx="40" cy="40" r="38" fill="#0d0d0d"/>'
        + '<polygon points="40,4 45,12 52,6 53,15 62,11 61,20 70,18 67,28 76,28 71,37 80,40 71,43 76,52 67,52 70,62 61,60 62,69 53,65 52,74 45,68 40,76 35,68 28,74 27,65 18,69 19,60 10,62 13,52 4,52 9,43 0,40 9,37 4,28 13,28 10,18 19,20 18,11 27,15 28,6 35,12" fill="'+c+'"/>'
        + '<circle cx="40" cy="40" r="26" fill="'+d+'"/>'
        + '<circle cx="40" cy="40" r="21" fill="'+c+'"/>'
        + '<circle cx="25" cy="46" r="9" fill="rgba(255,255,255,0.1)"/>'
        + '<circle cx="55" cy="46" r="9" fill="rgba(255,255,255,0.1)"/>'
        + '<ellipse cx="32" cy="37" rx="5" ry="4.5" fill="'+l+'"/>'
        + '<ellipse cx="32" cy="37" rx="2.5" ry="3.5" fill="#111"/>'
        + '<circle cx="33" cy="36" r="0.9" fill="white"/>'
        + '<ellipse cx="48" cy="37" rx="5" ry="4.5" fill="'+l+'"/>'
        + '<ellipse cx="48" cy="37" rx="2.5" ry="3.5" fill="#111"/>'
        + '<circle cx="49" cy="36" r="0.9" fill="white"/>'
        + '<path d="M35,44 L40,42 L45,44 L40,47Z" fill="#111"/>'
        + '<circle cx="22" cy="46" r="1.5" fill="rgba(0,0,0,0.4)"/>'
        + '<circle cx="22" cy="50" r="1.5" fill="rgba(0,0,0,0.4)"/>'
        + '<circle cx="58" cy="46" r="1.5" fill="rgba(0,0,0,0.4)"/>'
        + '<circle cx="58" cy="50" r="1.5" fill="rgba(0,0,0,0.4)"/>'
        + '<path d="M34,48 Q40,54 46,48" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round"/>'
        + '<path d="M40,47 L40,51" stroke="#111" stroke-width="1.5" stroke-linecap="round"/>'
        + '<circle cx="40" cy="40" r="38" fill="none" stroke="'+l+'" stroke-width="2.5"/>';
    }

    return '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">' + inner + '</svg>';
  }

  /** Render a single match as a compact horizontal row */
  function renderComingMatchCard(game) {
    var homeName = game.homeTeamName || game.homeTeamId || '—';
    var awayName = game.awayTeamName || game.awayTeamId || '—';
    var rawDate = game.date || '';
    var time = _formatTime(game.time);
    var venue = game.venue || '';
    var homeLogo = _teamLogo(homeName);
    var awayLogo = _teamLogo(awayName);

    // Parse date parts for the date column
    var dayNum = '', monStr = '', dowStr = '';
    if (rawDate) {
      var d = new Date(rawDate + 'T00:00:00');
      if (!isNaN(d)) {
        dayNum = d.getDate();
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        monStr = months[d.getMonth()];
        dowStr = days[d.getDay()];
      }
    }

    var html = '<div class="cm-row">';

    // Date column
    html += '<div class="cm-row-date">';
    if (dayNum) {
      html += '<span class="cm-row-date-mon">' + escapeHtml(monStr) + '</span>';
      html += '<span class="cm-row-date-day">' + dayNum + '</span>';
      html += '<span class="cm-row-date-dow">' + escapeHtml(dowStr) + '</span>';
    }
    html += '</div>';

    // Home team (right-aligned)
    html += '<div class="cm-row-home">';
    html += '<span class="cm-row-team-name">' + escapeHtml(homeName) + '</span>';
    html += '<div class="cm-row-logo">' + homeLogo + '</div>';
    html += '</div>';

    // VS + time center
    html += '<div class="cm-row-vs">';
    html += '<span class="cm-row-vs-text">VS</span>';
    if (time) html += '<span class="cm-row-time">' + escapeHtml(time) + '</span>';
    html += '</div>';

    // Away team (left-aligned)
    html += '<div class="cm-row-away">';
    html += '<div class="cm-row-logo">' + awayLogo + '</div>';
    html += '<span class="cm-row-team-name">' + escapeHtml(awayName) + '</span>';
    html += '</div>';

    // Meta: badge + venue
    html += '<div class="cm-row-meta">';
    if (game._seasonLabel) html += '<span class="cm-row-badge">' + escapeHtml(game._seasonLabel) + '</span>';
    html += '<span class="cm-row-badge">UPCOMING</span>';
    if (venue) html += '<span class="cm-row-venue">📍 ' + escapeHtml(venue) + '</span>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // --- 即將進行的賽程（需求 3.2）---
  function loadUpcomingGames(seasons) {
    if (!upcomingGamesEl) return;
    upcomingGamesEl.innerHTML = '<div class="loading" data-i18n="common.loading">' + I18n.t('common.loading') + '</div>';

    var comingEl = document.getElementById('coming-matches-list');
    var displaySeasons = (seasons && seasons.length) ? seasons : [currentSeason];

    Promise.all(displaySeasons.map(function (season) {
      return Promise.all([API.getSchedule(season.id), API.getTeams(season.id)]).then(function (results) {
        return { season: season, games: results[0] || [], teams: results[1] || [] };
      });
    }))
      .then(function (seasonResults) {
        var hiddenCards = [];
        var allUpcoming = [];
        var blocks = seasonResults.map(function (seasonData) {
          var teamsMap = {};
          seasonData.teams.forEach(function (t) { teamsMap[t.id] = t; });

          seasonData.games.forEach(function (g) {
            var ht = teamsMap[g.homeTeamId];
            var at = teamsMap[g.awayTeamId];
            if (!g.homeTeamName && ht) g.homeTeamName = ht.name || '';
            if (!g.awayTeamName && at) g.awayTeamName = at.name || '';
            g._homeJersey = ht ? (ht.jerseyHome || '') : '';
            g._awayJersey = at ? (at.jerseyAway || '') : '';
            g._seasonLabel = formatSeasonLabel(seasonData.season);
          });

          var minDate = todayYmd();
          var upcoming = seasonData.games.filter(function (g) { return g.status === 'scheduled' && (!g.date || g.date >= minDate); });
          upcoming.sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''); });
          var next = upcoming.slice(0, 4);
          allUpcoming = allUpcoming.concat(next);
          hiddenCards = hiddenCards.concat(next.slice(0, 3).map(renderUpcomingCard));
          return renderHomeSeasonBlock(seasonData.season, next.length + ' upcoming', next.length ? next.map(renderComingMatchCard).join('') : '<p class="text-muted">暫無賽事</p>');
        });

        if (comingEl) comingEl.innerHTML = blocks.join('') || '<p class="text-muted">暫無賽事</p>';
        upcomingGamesEl.innerHTML = hiddenCards.join('') || '<p class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</p>';

        allUpcoming.sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''); });
        var firstGame = allUpcoming[0];
        var metaEl = document.getElementById('hero-meta-text');
        if (metaEl && firstGame && firstGame.date) {
          metaEl.textContent = _formatDate(firstGame.date) + ' · ' + (firstGame._seasonLabel || 'Season') + ' · Hong Kong';
        }
      })
      .catch(function () {
        upcomingGamesEl.innerHTML = '<p class="text-muted">' + I18n.t('error.loadFailed') + ' <button class="btn btn-outline btn-sm" onclick="location.reload()">' + I18n.t('common.retry') + '</button></p>';
        if (comingEl) comingEl.innerHTML = '<p class="text-muted">' + I18n.t('error.loadFailed') + '</p>';
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
  function loadStandings(seasons) {
    if (!standingsBody) return;
    standingsBody.innerHTML = '<tr><td colspan="8" class="loading" data-i18n="common.loading">' + I18n.t('common.loading') + '</td></tr>';
    var displaySeasons = (seasons && seasons.length) ? seasons : [currentSeason];

    Promise.all(displaySeasons.map(function (season) {
      return Promise.all([API.getGames(season.id), API.getTeams(season.id)]).then(function (results) {
        return { season: season, games: results[0] || [], teams: results[1] || [] };
      });
    })).then(function (seasonResults) {
      var html = seasonResults.map(function (seasonData) {
        if (seasonData.teams.length === 0) {
          return '<tr><td colspan="8" class="text-muted">' + escapeHtml(formatSeasonLabel(seasonData.season)) + ' · ' + I18n.t('common.noData') + '</td></tr>';
        }
        var standings = _computeStandings(seasonData.games, seasonData.teams);
        var label = formatSeasonLabel(seasonData.season);
        var seasonName = seasonData.season.name || 'Standings';
        var head = '<tr><td colspan="8" style="background:#111;color:#fff;font-weight:900;text-align:left;text-transform:uppercase;letter-spacing:.08em"><span class="home-season-label">' + escapeHtml(label) + '</span> · <span class="home-season-name">' + escapeHtml(seasonName) + '</span></td></tr>';
        return head + renderStandingsRows(standings, seasonData.teams, seasonData.games, seasonData.season);
      }).join('');
      standingsBody.innerHTML = html || '<tr><td colspan="8" class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</td></tr>';
    }).catch(function () {
      standingsBody.innerHTML = '<tr><td colspan="8" class="text-muted">' + I18n.t('error.loadFailed') + '</td></tr>';
    });
  }

  /**
   * 從比賽數據計算球隊積分榜（節分優先）
   * 積分制：勝3分 / 和2分 / 負1分 / 棄權0分
    * 同分排名：全組得失球差
   */
  function _computeStandings(games, teams) {
    var table = {};
    teams.forEach(function (t) {
      table[t.id] = {
        id: t.id,
        teamName: t.name || t.teamName || t.id,
        division: (typeof SeasonRules !== 'undefined') ? SeasonRules.getTeamDivision(t) : '',
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
   * 排名排序：積分 → 全組得失球差
   */
  function _sortStandings(rows, allResults) {
    rows.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      return b.diff - a.diff;
    });
    return rows;
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

  function renderStandingsRows(standings, teams, games, season) {
    var context = (typeof SeasonRules !== 'undefined') ? SeasonRules.buildContext(teams || [], games || [], season || currentSeason || currentSeasonId) : null;
    if (!context || !context.rules.isDivisionRoundRobin) {
      return standings.slice(0, 8).map(function (team, idx) {
        return renderStandingRow(team, idx + 1);
      }).join('');
    }

    var byId = {};
    standings.forEach(function (team) { byId[team.id] = team; });
    return SeasonRules.getDivisionNames(context).map(function (division) {
      var rows = (context.divisions[division] || []).map(function (id) { return byId[id]; }).filter(Boolean);
      rows.sort(function (a, b) {
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        return (a.teamName || '').localeCompare(b.teamName || '');
      });
      var html = '<tr><td colspan="8" style="background:#111827;color:#fff;font-weight:900;text-align:left;text-transform:uppercase;letter-spacing:.06em">' + escapeHtml(division) + ' · ' + rows.length + ' teams</td></tr>';
      html += rows.slice(0, 6).map(function (team, idx) { return renderStandingRow(team, idx + 1); }).join('');
      return html;
    }).join('');
  }

  function loadHomeLeaderboards(seasons) {
    if (!homeLeaderboardsEl) return;
    homeLeaderboardsEl.innerHTML = '<p class="text-muted">' + I18n.t('common.loading') + '</p>';
    var displaySeasons = (seasons && seasons.length) ? seasons : [currentSeason];
    var categories = [
      { key: 'pts', label: 'POINTS', abbr: 'PTS', color: '#cc0000' },
      { key: 'reb', label: 'REBOUNDS', abbr: 'REB', color: '#1a6fd4' },
      { key: 'ast', label: 'ASSISTS', abbr: 'AST', color: '#0ea854' },
      { key: 'stl', label: 'STEALS', abbr: 'STL', color: '#d47a00' },
      { key: 'blk', label: 'BLOCKS', abbr: 'BLK', color: '#9b27d4' },
      { key: 'tpm', label: '3-POINTERS', abbr: '3PM', color: '#00aac4' }
    ];

    Promise.all(displaySeasons.map(function (season) {
      return Promise.all(categories.map(function (category) {
        return API.getLeaders(season.id, category.key).then(function (leaders) {
          return { category: category, leader: normalizeHomeLeader((leaders || [])[0]) };
        }).catch(function () {
          return { category: category, leader: null };
        });
      })).then(function (leaders) {
        return { season: season, leaders: leaders };
      });
    })).then(function (seasonResults) {
      homeLeaderboardsEl.innerHTML = seasonResults.map(function (seasonData) {
        var cards = seasonData.leaders.map(function (item) {
          return renderHomeLeaderCard(item.category, item.leader);
        }).join('');
        return renderHomeSeasonBlock(seasonData.season, '各類別最佳球員', '<div class="home-leaderboard-grid">' + cards + '</div>');
      }).join('') || '<p class="text-muted">' + I18n.t('common.noData') + '</p>';
    }).catch(function () {
      homeLeaderboardsEl.innerHTML = '<p class="text-muted">' + I18n.t('error.loadFailed') + '</p>';
    });
  }

  var HOME_SILHOUETTE_SVG = '<svg viewBox="0 0 100 200" xmlns="http://www.w3.org/2000/svg" fill="white" opacity=".18">'
    + '<circle cx="50" cy="20" r="15"/>'
    + '<path d="M30,42 Q18,35 10,12 L17,9 Q22,30 38,46Z"/>'
    + '<circle cx="10" cy="11" r="10"/>'
    + '<path d="M70,42 Q75,32 82,18 L89,21 Q84,37 64,47Z"/>'
    + '<circle cx="90" cy="10" r="10"/>'
    + '<ellipse cx="50" cy="72" rx="20" ry="28"/>'
    + '<path d="M30,96 L22,158 L36,158 L50,115 L64,158 L78,158 L70,96Z"/>'
    + '</svg>';

  function normalizeHomeLeader(leader) {
    if (!leader) return null;
    return {
      playerId: leader.playerId || '',
      playerName: leader.playerName || leader.player || leader.name || leader.playerId || '—',
      teamName: leader.teamName || leader.team || '',
      number: leader.number !== undefined && leader.number !== null ? leader.number : '',
      photo: leader.leaderPhoto || leader.photo || '',
      value: leader.value != null ? leader.value : (leader.total != null ? leader.total : 0)
    };
  }

  function renderHomeLeaderCard(category, leader) {
    var value = leader ? Number(leader.value) : 0;
    var displayValue = leader ? (!isNaN(value) && value % 1 !== 0 ? value.toFixed(1) : String(leader.value)) : '—';
    var name = leader ? escapeHtml(leader.playerName || '—') : '—';
    var team = leader ? escapeHtml(leader.teamName || '—') : '—';
    var jersey = leader && leader.number !== '' ? ' #' + escapeHtml(String(leader.number)) : '';
    var pid = leader && leader.playerId ? encodeURIComponent(leader.playerId) : '';
    var photoHtml = leader && leader.photo
      ? '<img class="sl-photo" src="' + escapeHtml(leader.photo) + '" alt="' + name + '" loading="lazy" onerror="this.style.display=\'none\'">'
      : HOME_SILHOUETTE_SVG;
    var cardTag = pid ? 'a' : 'div';
    var cardHref = pid ? ' href="player.html?id=' + pid + '"' : '';
    var cardClass = pid ? 'sl-card sl-card-link' : 'sl-card';

    return '<' + cardTag + cardHref + ' class="' + cardClass + '" style="--sl-color:' + category.color + '" role="article" aria-label="' + escapeHtml(category.label) + ' leader">'
      + '<div class="sl-photo-area">'
      + photoHtml
      + '<div class="sl-photo-gradient"></div>'
      + '<div class="sl-badge">' + escapeHtml(category.abbr) + '</div>'
      + '<div class="sl-num">' + escapeHtml(displayValue) + '</div>'
      + '</div>'
      + '<div class="sl-info">'
      + '<span class="sl-cat-name">' + escapeHtml(category.label) + '</span>'
      + '<span class="sl-player-name">' + name + '</span>'
      + '<span class="sl-team">' + team + jersey + '</span>'
      + '</div>'
      + '</' + cardTag + '>';
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
    if (homeLeaderboardsEl) homeLeaderboardsEl.innerHTML = noData;
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
