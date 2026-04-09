/**
 * ALL-IN Basketball League — 球員檔案頁面邏輯
 * 顯示球員資料、賽季平均、得分趨勢圖、逐場記錄、進階數據、成就展示櫃
 * 需求：4.1, 4.2, 4.3, 4.4, 4.5, 14.4, 14.5, 15.5
 */
(function () {
  'use strict';

  // --- 從 URL 取得 playerId ---
  var params = new URLSearchParams(window.location.search);
  var playerId = params.get('id') || params.get('playerId') || '';

  /** @type {Chart|null} */
  var trendChartInstance = null;

  // --- 初始化 ---
  function init() {
    if (!playerId) {
      showPlayerDirectory();
      return;
    }
    setupTabs();
    loadPlayerData();
  }

  // --- 球員目錄（無 ID 時顯示所有球員列表）---
  function showPlayerDirectory() {
    var main = document.querySelector('.main-content');
    if (!main) return;
    main.innerHTML = '<section class="section"><div class="container">' +
      '<h1 class="section-title">球員目錄</h1>' +
      '<div id="player-dir" class="text-muted">載入中...</div>' +
      '</div></section>';
    API.getSeasons().then(function (seasons) {
      var active = (seasons || []).find(function (s) { return s.status === 'active'; }) || (seasons || [])[0];
      if (!active) { document.getElementById('player-dir').textContent = '暫無賽季資料'; return; }
      return API.getTeams(active.id).then(function (teams) {
        if (!teams || teams.length === 0) { document.getElementById('player-dir').textContent = '暫無球隊資料'; return; }
        var promises = teams.map(function (t) {
          return API.getPlayers(t.id).then(function (players) { return { team: t, players: players || [] }; });
        });
        return Promise.all(promises);
      });
    }).then(function (results) {
      if (!results) return;
      var dir = document.getElementById('player-dir');
      var html = '';
      results.forEach(function (r) {
        html += '<h2 class="section-subtitle" style="margin-top:1.5rem">' + escapeHtml(r.team.name) + '</h2>';
        if (r.players.length === 0) { html += '<p class="text-muted">暫無球員</p>'; return; }
        html += '<div class="games-grid">';
        r.players.forEach(function (p) {
          html += '<a href="player.html?id=' + encodeURIComponent(p.id) + '" class="game-card" style="text-decoration:none">' +
            '<div class="game-card-matchup"><span class="game-card-team">#' + escapeHtml(String(p.number || '')) + ' ' + escapeHtml(p.name) + '</span></div>' +
            '<div class="text-muted" style="font-size:.85rem">' + escapeHtml(p.position || '') + '</div></a>';
        });
        html += '</div>';
      });
      dir.innerHTML = html;
    }).catch(function () {
      document.getElementById('player-dir').textContent = '載入失敗';
    });
  }

  // --- 分頁切換 ---
  function setupTabs() {
    var tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetTab = btn.getAttribute('data-tab');
        // 更新按鈕狀態
        tabBtns.forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        // 更新面板
        var panels = document.querySelectorAll('.tab-panel');
        panels.forEach(function (p) { p.classList.remove('active'); });
        var target = document.getElementById('tab-' + targetTab);
        if (target) target.classList.add('active');
      });
    });
  }

  // --- 載入球員數據 ---
  function loadPlayerData() {
    API.getPlayerProfile(playerId)
      .then(function (data) {
        renderProfile(data);
        renderSeasonAvg(data.seasonAvg);
        renderTrendChart(data.gameLogs);
        renderGameLogs(data.gameLogs);
        renderMultiSeason(data.seasonHistory);
        // 載入進階數據及成就
        loadAdvancedStats();
        loadAchievements();
        // 載入投籃熱力圖
        loadShotChart();
      })
      .catch(function () {
        showError(I18n.t('error.loadFailed'));
      });
  }

  // --- 渲染球員基本資料（需求 4.1）---
  function renderProfile(data) {
    var info = data.info || data;
    var nameEl = document.getElementById('player-name');
    var photoEl = document.getElementById('player-photo');
    var numberEl = document.getElementById('player-number');
    var teamEl = document.getElementById('player-team-name');
    var positionEl = document.getElementById('player-position');
    var gamesEl = document.getElementById('player-games');

    if (nameEl) nameEl.textContent = info.name || '—';
    if (photoEl && info.photo) {
      photoEl.src = info.photo;
      photoEl.alt = info.name || '';
    }
    if (numberEl) numberEl.textContent = info.number != null ? '#' + info.number : '';
    if (teamEl) {
      teamEl.textContent = info.teamName || info.team || '—';
      if (info.teamId) {
        teamEl.innerHTML = '<a href="team.html?id=' + encodeURIComponent(info.teamId) + '">' + escapeHtml(info.teamName || info.team || '—') + '</a>';
      }
    }
    if (positionEl) positionEl.textContent = info.position || '—';
    if (gamesEl) gamesEl.textContent = info.gamesPlayed != null ? info.gamesPlayed : '—';

    // 更新頁面標題
    if (info.name) {
      document.title = info.name + ' — ALL-IN Basketball League';
    }
  }

  // --- 渲染賽季平均數據（需求 4.2）---
  function renderSeasonAvg(avg) {
    var container = document.getElementById('season-avg-cards');
    if (!container) return;

    if (!avg) {
      container.innerHTML = '<p class="text-muted" data-i18n="player.noData">' + I18n.t('player.noData') + '</p>';
      return;
    }

    var stats = [
      { key: 'pts', label: I18n.t('table.pts'), value: fmtNum(avg.pts) },
      { key: 'reb', label: I18n.t('table.reb'), value: fmtNum(avg.reb) },
      { key: 'ast', label: I18n.t('table.ast'), value: fmtNum(avg.ast) },
      { key: 'stl', label: I18n.t('table.stl'), value: fmtNum(avg.stl) },
      { key: 'blk', label: I18n.t('table.blk'), value: fmtNum(avg.blk) },
      { key: 'fgPct', label: I18n.t('table.fgPct'), value: fmtPct(avg.fgPct || avg.fg_pct) }
    ];

    container.innerHTML = stats.map(function (s) {
      return '<div class="stat-card">' +
        '<div class="stat-value">' + escapeHtml(s.value) + '</div>' +
        '<div class="stat-label">' + escapeHtml(s.label) + '</div>' +
        '</div>';
    }).join('');
  }

  // --- 渲染得分趨勢折線圖（需求 4.3）---
  function renderTrendChart(gameLogs) {
    var canvas = document.getElementById('trend-chart');
    if (!canvas) return;

    if (!gameLogs || gameLogs.length === 0) {
      canvas.parentElement.innerHTML = '<p class="text-muted">' + I18n.t('player.noData') + '</p>';
      return;
    }

    // 取最近 5 場，按日期升序
    var sorted = gameLogs.slice().sort(function (a, b) {
      return (a.date || '').localeCompare(b.date || '');
    });
    var recent = sorted.slice(-5);

    var labels = recent.map(function (g) { return Utils.formatDateWithDay(g.date); });
    var points = recent.map(function (g) { return g.pts || 0; });

    if (trendChartInstance) {
      trendChartInstance.destroy();
    }

    trendChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: I18n.t('table.pts'),
          data: points,
          borderColor: '#e94560',
          backgroundColor: 'rgba(233, 69, 96, 0.1)',
          borderWidth: 2,
          pointBackgroundColor: '#e94560',
          pointRadius: 5,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: '#a0a0b8' },
            grid: { color: 'rgba(42, 42, 74, 0.5)' }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#a0a0b8' },
            grid: { color: 'rgba(42, 42, 74, 0.5)' }
          }
        }
      }
    });
  }

  // --- 渲染逐場 Box Score 記錄（需求 4.4）---
  function renderGameLogs(gameLogs) {
    var tbody = document.getElementById('gamelogs-body');
    if (!tbody) return;

    if (!gameLogs || gameLogs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-muted">' + I18n.t('player.noData') + '</td></tr>';
      return;
    }

    // 按日期降序
    var sorted = gameLogs.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });

    tbody.innerHTML = sorted.map(function (g) {
      var fgPct = (g.fga && g.fga > 0) ? ((g.fgm / g.fga) * 100).toFixed(1) + '%' : '—';
      var tpPct = (g.tpa && g.tpa > 0) ? ((g.tpm / g.tpa) * 100).toFixed(1) + '%' : '—';
      var ftPct = (g.fta && g.fta > 0) ? ((g.ftm / g.fta) * 100).toFixed(1) + '%' : '—';
      var result = '';
      if (g.result) {
        result = g.result;
      } else if (g.teamScore != null && g.opponentScore != null) {
        result = g.teamScore + '-' + g.opponentScore;
      }

      return '<tr>' +
        '<td>' + escapeHtml(Utils.formatDateWithDay(g.date)) + '</td>' +
        '<td>' + escapeHtml(g.opponent || g.opponentName || '—') + '</td>' +
        '<td>' + escapeHtml(result) + '</td>' +
        '<td>' + (g.pts != null ? g.pts : 0) + '</td>' +
        '<td>' + (g.reb != null ? g.reb : 0) + '</td>' +
        '<td>' + (g.ast != null ? g.ast : 0) + '</td>' +
        '<td>' + (g.stl != null ? g.stl : 0) + '</td>' +
        '<td>' + (g.blk != null ? g.blk : 0) + '</td>' +
        '<td>' + fgPct + '</td>' +
        '<td>' + tpPct + '</td>' +
        '<td>' + ftPct + '</td>' +
        '</tr>';
    }).join('');
  }

  // --- 渲染多賽季平均數據對比（需求 4.5）---
  function renderMultiSeason(seasonHistory) {
    var section = document.getElementById('multi-season-section');
    var tbody = document.getElementById('multi-season-body');
    if (!section || !tbody) return;

    if (!seasonHistory || seasonHistory.length <= 1) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    tbody.innerHTML = seasonHistory.map(function (s) {
      return '<tr>' +
        '<td>' + escapeHtml(s.seasonName || s.seasonId || '—') + '</td>' +
        '<td>' + (s.gamesPlayed != null ? s.gamesPlayed : 0) + '</td>' +
        '<td>' + fmtNum(s.pts) + '</td>' +
        '<td>' + fmtNum(s.reb) + '</td>' +
        '<td>' + fmtNum(s.ast) + '</td>' +
        '<td>' + fmtNum(s.stl) + '</td>' +
        '<td>' + fmtNum(s.blk) + '</td>' +
        '<td>' + fmtPct(s.fgPct || s.fg_pct) + '</td>' +
        '</tr>';
    }).join('');
  }

  // --- 載入進階數據（需求 14.4, 14.5）---
  function loadAdvancedStats() {
    var grid = document.getElementById('advanced-stats-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="loading">' + I18n.t('common.loading') + '</div>';

    API.getAdvancedStats(playerId)
      .then(function (data) {
        if (!data) {
          grid.innerHTML = '<p class="text-muted">' + I18n.t('player.noData') + '</p>';
          return;
        }
        renderAdvancedStats(data);
      })
      .catch(function () {
        grid.innerHTML = '<p class="text-muted">' + I18n.t('player.noData') + '</p>';
      });
  }

  function renderAdvancedStats(data) {
    var grid = document.getElementById('advanced-stats-grid');
    if (!grid) return;

    var items = [
      {
        label: I18n.t('advanced.tsPct'),
        value: fmtPct(data.ts_pct || data.tsPct),
        tooltip: I18n.t('advanced.tsPctDesc')
      },
      {
        label: I18n.t('advanced.usgPct'),
        value: fmtPct(data.usg_pct || data.usgPct),
        tooltip: I18n.t('advanced.usgPctDesc')
      },
      {
        label: I18n.t('advanced.per'),
        value: fmtNum(data.per),
        tooltip: I18n.t('advanced.perDesc')
      }
    ];

    grid.innerHTML = items.map(function (item) {
      return '<div class="advanced-stat-card">' +
        '<div class="advanced-stat-header">' +
          '<span class="advanced-stat-label">' + escapeHtml(item.label) + '</span>' +
          '<span class="tooltip-trigger" tabindex="0" role="button" aria-label="' + escapeHtml(item.label) + ' 說明">' +
            '<span class="tooltip-icon">ⓘ</span>' +
            '<span class="tooltip-content">' + escapeHtml(item.tooltip) + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="advanced-stat-value">' + escapeHtml(item.value) + '</div>' +
        '</div>';
    }).join('');
  }

  // --- 載入成就展示櫃（需求 15.5）---
  function loadAchievements() {
    var container = document.getElementById('achievements-showcase');
    if (!container) return;
    container.innerHTML = '<div class="loading">' + I18n.t('common.loading') + '</div>';

    API.getAchievements(playerId)
      .then(function (achievements) {
        if (!achievements || achievements.length === 0) {
          container.innerHTML = '<p class="text-muted">' + I18n.t('player.noData') + '</p>';
          return;
        }
        renderAchievements(achievements);
      })
      .catch(function () {
        container.innerHTML = '<p class="text-muted">' + I18n.t('player.noData') + '</p>';
      });
  }

  function renderAchievements(achievements) {
    var container = document.getElementById('achievements-showcase');
    if (!container) return;

    var badgeEmojis = {
      PTS_30: '🔥',
      TRIPLE_DOUBLE: '👑',
      DOUBLE_DOUBLE: '💪',
      BLK_5: '🛡️',
      STREAK_PTS_20: '🎯',
      STREAK_DD_3: '⚡',
      STREAK_GAMES_10: '🏃'
    };

    container.innerHTML = achievements.map(function (ach) {
      var typeKey = 'achievement.' + (ach.type || '');
      var typeName = I18n.t(typeKey);
      if (typeName === typeKey) typeName = ach.type || '';
      var emoji = badgeEmojis[ach.type] || '🏆';
      var dateStr = Utils.formatDateWithDay(ach.date);

      return '<div class="achievement-badge-card">' +
        '<div class="achievement-badge-icon" aria-hidden="true">' + emoji + '</div>' +
        '<div class="achievement-badge-info">' +
          '<div class="achievement-badge-name">' + escapeHtml(typeName) + '</div>' +
          '<div class="achievement-badge-date text-muted">' + escapeHtml(I18n.t('achievement.achievedOn', { date: dateStr })) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  // --- 投籃熱力圖（需求 9.3, 9.4, 9.5）---
  /** @type {Array<{x:number, y:number, made:boolean, gameId:string}>} */
  var allShotData = [];

  function loadShotChart() {
    var container = document.getElementById('shotchart-canvas');
    if (!container) return;

    // Load all shots for this player (no gameId = entire season)
    API.getShotChart(playerId)
      .then(function (shots) {
        allShotData = shots || [];
        populateGameFilter(allShotData);
        renderShotChart(allShotData);
        setupShotChartFilter();
      })
      .catch(function () {
        var wrapper = container.parentElement;
        if (wrapper) {
          wrapper.innerHTML = '<p class="text-muted">' + I18n.t('player.noData') + '</p>';
        }
      });
  }

  function populateGameFilter(shots) {
    var select = document.getElementById('shotchart-game-filter');
    if (!select) return;

    // Extract unique gameIds
    var gameIds = {};
    for (var i = 0; i < shots.length; i++) {
      var gid = shots[i].gameId;
      if (gid && !gameIds[gid]) {
        gameIds[gid] = true;
      }
    }

    // Keep the "All Games" default option, add per-game options
    var keys = Object.keys(gameIds);
    for (var j = 0; j < keys.length; j++) {
      var opt = document.createElement('option');
      opt.value = keys[j];
      opt.textContent = keys[j];
      select.appendChild(opt);
    }
  }

  function setupShotChartFilter() {
    var select = document.getElementById('shotchart-game-filter');
    if (!select) return;
    select.addEventListener('change', function () {
      var gameId = select.value;
      var filtered = gameId
        ? allShotData.filter(function (s) { return s.gameId === gameId; })
        : allShotData;
      renderShotChart(filtered);
    });
  }

  function renderShotChart(shots) {
    var canvasId = 'shotchart-canvas';
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (!shots || shots.length === 0) {
      // Show no-data message but keep canvas for potential future data
      var wrapper = canvas.parentElement;
      if (wrapper) {
        wrapper.innerHTML = '<p class="text-muted">' + I18n.t('player.noData') + '</p>' +
          '<canvas id="' + canvasId + '" aria-label="投籃熱力圖" style="display:none;"></canvas>';
      }
      return;
    }

    // Ensure canvas is visible
    canvas.style.display = '';
    Charts.createShotChart(canvasId, shots, 'images/court-half.svg');
  }

  // --- 工具函數 ---
  function fmtNum(val) {
    return Utils.formatNumber(val, 1);
  }

  function fmtPct(val) {
    if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return '0.0%';
    // 如果值已經是百分比形式（> 1），直接格式化
    if (val > 1) return Number(val).toFixed(1) + '%';
    return (val * 100).toFixed(1) + '%';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showError(msg) {
    var main = document.querySelector('.main-content');
    if (main) {
      main.innerHTML = '<div class="container" style="padding:var(--spacing-3xl) 0;text-align:center;">' +
        '<p class="text-muted">' + escapeHtml(msg) + '</p>' +
        '<a href="index.html" class="btn btn-outline" style="margin-top:var(--spacing-md);" data-i18n="nav.home">' + I18n.t('nav.home') + '</a>' +
        '</div>';
    }
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
