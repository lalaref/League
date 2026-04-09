/**
 * ALL-IN Basketball League — 球隊頁面邏輯
 * 顯示球隊資料、球員名單、排名歷史、H2H 對比、當前賽季戰績
 * 需求：5.1, 5.2, 5.3, 5.4, 5.5
 */
(function () {
  'use strict';

  // --- 從 URL 取得 teamId ---
  var params = new URLSearchParams(window.location.search);
  var teamId = params.get('id') || params.get('teamId') || '';

  /** @type {Object|null} 當前球隊的完整 profile 數據 */
  var teamData = null;

  // --- 初始化 ---
  function init() {
    if (!teamId) {
      showTeamDirectory();
      return;
    }
    loadTeamData();
  }

  // --- 球隊目錄（無 ID 時顯示所有球隊列表）---
  function showTeamDirectory() {
    var main = document.querySelector('.main-content');
    if (!main) return;
    main.innerHTML = '<section class="section"><div class="container">' +
      '<h1 class="section-title">球隊目錄</h1>' +
      '<div id="team-dir" class="text-muted">載入中...</div>' +
      '</div></section>';
    API.getSeasons().then(function (seasons) {
      var active = (seasons || []).find(function (s) { return s.status === 'active'; }) || (seasons || [])[0];
      if (!active) { document.getElementById('team-dir').textContent = '暫無賽季資料'; return; }
      return API.getTeams(active.id);
    }).then(function (teams) {
      if (!teams || teams.length === 0) { document.getElementById('team-dir').textContent = '暫無球隊資料'; return; }
      var html = '<div class="games-grid">';
      teams.forEach(function (t) {
        html += '<a href="team.html?id=' + encodeURIComponent(t.id) + '" class="game-card" style="text-decoration:none">' +
          '<div class="game-card-matchup"><span class="game-card-team">' + escapeHtml(t.name) + '</span></div>' +
          '<div class="text-muted" style="font-size:.85rem">' + escapeHtml(t.captain || '') + '</div></a>';
      });
      html += '</div>';
      document.getElementById('team-dir').innerHTML = html;
    }).catch(function () {
      document.getElementById('team-dir').textContent = '載入失敗';
    });
  }

  // --- 載入球隊數據 ---
  function loadTeamData() {
    API.getTeamProfile(teamId)
      .then(function (data) {
        teamData = data;
        renderTeamInfo(data.info || data);
        renderRoster(data.roster);
        renderHistory(data.history);
        renderCurrentRecord(data);
        populateH2HDropdown(data);
      })
      .catch(function () {
        showError(I18n.t('error.loadFailed'));
      });
  }

  // --- 渲染球隊基本資料（需求 5.1）---
  function renderTeamInfo(info) {
    var nameEl = document.getElementById('team-name');
    var logoEl = document.getElementById('team-logo');
    var captainEl = document.getElementById('team-captain');
    var descEl = document.getElementById('team-description');

    if (nameEl) nameEl.textContent = info.name || '—';
    if (logoEl && info.logo) {
      logoEl.src = info.logo;
      logoEl.alt = info.name || '';
    }
    if (captainEl) captainEl.textContent = info.captain || '—';
    if (descEl) descEl.textContent = info.description || '—';

    // 更新頁面標題
    if (info.name) {
      document.title = info.name + ' — ALL-IN Basketball League';
    }
  }

  // --- 渲染球員名單（需求 5.2）---
  function renderRoster(roster) {
    var tbody = document.getElementById('roster-body');
    if (!tbody) return;

    if (!roster || roster.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-muted">' + I18n.t('common.noData') + '</td></tr>';
      return;
    }

    // 按球衣號碼排序
    var sorted = roster.slice().sort(function (a, b) {
      return (a.number || 0) - (b.number || 0);
    });

    tbody.innerHTML = sorted.map(function (p) {
      var playerLink = '<a href="player.html?id=' + encodeURIComponent(p.id || p.playerId || '') + '">' + escapeHtml(p.name || '—') + '</a>';
      return '<tr>' +
        '<td>#' + escapeHtml(String(p.number != null ? p.number : '')) + '</td>' +
        '<td>' + playerLink + '</td>' +
        '<td>' + fmtNum(p.pts) + '</td>' +
        '<td>' + fmtNum(p.reb) + '</td>' +
        '<td>' + fmtNum(p.ast) + '</td>' +
        '<td>' + fmtNum(p.stl) + '</td>' +
        '<td>' + fmtNum(p.blk) + '</td>' +
        '<td>' + fmtPct(p.fgPct || p.fg_pct) + '</td>' +
        '</tr>';
    }).join('');
  }

  // --- 渲染排名歷史（需求 5.3）---
  function renderHistory(history) {
    var section = document.getElementById('history-section');
    var tbody = document.getElementById('history-body');
    if (!section || !tbody) return;

    if (!history || history.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    tbody.innerHTML = history.map(function (h) {
      return '<tr>' +
        '<td>' + escapeHtml(h.seasonName || h.seasonId || '—') + '</td>' +
        '<td>' + (h.rank != null ? h.rank : '—') + '</td>' +
        '<td>' + (h.wins != null ? h.wins : 0) + '</td>' +
        '<td>' + (h.losses != null ? h.losses : 0) + '</td>' +
        '<td>' + fmtPctValue(h.wins, h.losses) + '</td>' +
        '</tr>';
    }).join('');
  }

  // --- 渲染當前賽季戰績及排名（需求 5.5）---
  function renderCurrentRecord(data) {
    var recordEl = document.getElementById('team-record-value');
    var rankBadge = document.getElementById('team-rank-badge');

    // 嘗試從 data 中取得當前賽季戰績
    var wins = 0;
    var losses = 0;
    var rank = null;

    // 從 history 中取最新賽季
    if (data.history && data.history.length > 0) {
      var latest = data.history[0];
      wins = latest.wins || 0;
      losses = latest.losses || 0;
      rank = latest.rank;
    }

    // 或直接從 data 取
    if (data.wins != null) wins = data.wins;
    if (data.losses != null) losses = data.losses;
    if (data.rank != null) rank = data.rank;

    if (recordEl) {
      recordEl.textContent = wins + I18n.t('table.wins') + ' ' + losses + I18n.t('table.losses');
    }
    if (rankBadge && rank != null) {
      rankBadge.textContent = '#' + rank;
    }
  }

  // --- 填充 H2H 下拉選單及綁定事件（需求 5.4）---
  function populateH2HDropdown(data) {
    var select = document.getElementById('h2h-team-select');
    if (!select) return;

    // 從 h2h 數據中取得可對比的球隊列表
    var h2hData = data.h2h || {};
    var teamIds = Object.keys(h2hData);

    if (teamIds.length === 0) {
      // 嘗試從 API 取得同賽季球隊列表
      API.getSeasons()
        .then(function (seasons) {
          if (!seasons || seasons.length === 0) return;
          var activeSeason = seasons.find(function (s) { return s.status === 'active'; }) || seasons[0];
          return API.getTeams(activeSeason.id);
        })
        .then(function (teams) {
          if (!teams) return;
          teams.forEach(function (t) {
            if (t.id !== teamId) {
              var opt = document.createElement('option');
              opt.value = t.id;
              opt.textContent = t.name;
              select.appendChild(opt);
            }
          });
        })
        .catch(function () {
          // 靜默處理
        });
    } else {
      teamIds.forEach(function (tid) {
        var record = h2hData[tid];
        var opt = document.createElement('option');
        opt.value = tid;
        opt.textContent = record.teamName || record.name || tid;
        select.appendChild(opt);
      });
    }

    // 綁定選擇事件
    select.addEventListener('change', function () {
      var selectedId = select.value;
      if (!selectedId) {
        document.getElementById('h2h-result').style.display = 'none';
        document.getElementById('h2h-empty').style.display = 'none';
        return;
      }
      renderH2H(selectedId, h2hData);
    });
  }

  // --- 渲染 H2H 對賽紀錄（需求 5.4）---
  function renderH2H(opponentId, h2hData) {
    var resultDiv = document.getElementById('h2h-result');
    var emptyDiv = document.getElementById('h2h-empty');
    var summaryDiv = document.getElementById('h2h-summary');
    var tbody = document.getElementById('h2h-body');

    if (!resultDiv || !summaryDiv || !tbody) return;

    var record = h2hData[opponentId];

    if (!record || (!record.games && !record.wins && !record.losses)) {
      // 沒有 H2H 數據，嘗試從 API 取得
      if (resultDiv) resultDiv.style.display = 'none';
      if (emptyDiv) {
        emptyDiv.style.display = '';
        emptyDiv.querySelector('p').textContent = I18n.t('common.noData');
      }
      return;
    }

    if (emptyDiv) emptyDiv.style.display = 'none';
    resultDiv.style.display = '';

    var teamName = (teamData && teamData.info) ? teamData.info.name : '';
    var opponentName = record.teamName || record.name || opponentId;
    var wins = record.wins || 0;
    var losses = record.losses || 0;

    summaryDiv.innerHTML =
      '<div class="h2h-summary-card">' +
        '<span class="h2h-team-name">' + escapeHtml(teamName) + '</span>' +
        '<span class="h2h-score">' + wins + ' - ' + losses + '</span>' +
        '<span class="h2h-team-name">' + escapeHtml(opponentName) + '</span>' +
      '</div>';

    // 渲染各場比分
    var games = record.games || [];
    if (games.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-muted">' + I18n.t('common.noData') + '</td></tr>';
      return;
    }

    tbody.innerHTML = games.map(function (g) {
      var scoreText = (g.homeScore != null && g.awayScore != null)
        ? g.homeScore + ' - ' + g.awayScore
        : (g.score || '—');
      var resultText = '';
      if (g.won === true) {
        resultText = '<span class="text-success">W</span>';
      } else if (g.won === false) {
        resultText = '<span class="text-error">L</span>';
      } else if (g.result) {
        resultText = g.result;
      }
      return '<tr>' +
        '<td>' + escapeHtml(Utils.formatDateWithDay(g.date)) + '</td>' +
        '<td>' + scoreText + '</td>' +
        '<td>' + resultText + '</td>' +
        '</tr>';
    }).join('');
  }

  // --- 工具函數 ---
  function fmtNum(val) {
    if (val === null || val === undefined || isNaN(val)) return '0.0';
    return Number(val).toFixed(1);
  }

  function fmtPct(val) {
    if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return '0.0%';
    if (val > 1) return Number(val).toFixed(1) + '%';
    return (val * 100).toFixed(1) + '%';
  }

  function fmtPctValue(wins, losses) {
    var total = (wins || 0) + (losses || 0);
    if (total === 0) return '.000';
    return ((wins || 0) / total).toFixed(3);
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
