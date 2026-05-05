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

  // --- 即將進行的賽程（需求 3.2）---
  function loadUpcomingGames() {
    if (!upcomingGamesEl) return;
    upcomingGamesEl.innerHTML = '<div class="loading" data-i18n="common.loading">' + I18n.t('common.loading') + '</div>';

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
          return;
        }
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

  // --- 球隊排名（需求 3.5）---
  function loadStandings() {
    if (!standingsBody) return;
    standingsBody.innerHTML = '<tr><td colspan="6" class="loading" data-i18n="common.loading">' + I18n.t('common.loading') + '</td></tr>';

    API.getStandings(currentSeasonId)
      .then(function (standings) {
        if (!standings || standings.length === 0) {
          standingsBody.innerHTML = '<tr><td colspan="6" class="text-muted" data-i18n="common.noData">' + I18n.t('common.noData') + '</td></tr>';
          return;
        }
        // 取前 8 名
        var top8 = standings.slice(0, 8);
        standingsBody.innerHTML = top8.map(function (team, idx) {
          return renderStandingRow(team, idx + 1);
        }).join('');
      })
      .catch(function () {
        standingsBody.innerHTML = '<tr><td colspan="6" class="text-muted">' + I18n.t('error.loadFailed') + '</td></tr>';
      });
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
