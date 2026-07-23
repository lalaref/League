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
  var selectedSeasonId = params.get('seasonId') || '';

  /** @type {Object|null} 當前球隊的完整 profile 數據 */
  var teamData = null;
  var seasonsCache = [];
  var teamsBySeason = {};

  // --- 初始化 ---
  function init() {
    loadSeasons().then(function () {
      if (!teamId) {
        showTeamDirectory();
        return;
      }
      loadTeamData();
    }).catch(function () {
      if (!teamId) {
        showTeamDirectory();
        return;
      }
      loadTeamData();
    });
  }

  function loadSeasons() {
    return API.getSeasons().then(function (seasons) {
      seasonsCache = seasons || [];
      if (!selectedSeasonId) {
        var active = getDefaultSeason(seasonsCache);
        selectedSeasonId = active ? active.id : '';
      }
      populateSeasonSelect();
    });
  }

  function populateSeasonSelect() {
    var select = document.getElementById('team-season-select');
    if (!select) return;
    select.innerHTML = '';
    if (!seasonsCache.length) {
      select.innerHTML = '<option value="">暫無賽季資料</option>';
      return;
    }
    seasonsCache.forEach(function (season) {
      var opt = document.createElement('option');
      opt.value = season.id;
      opt.textContent = season.name || season.id;
      select.appendChild(opt);
    });
    select.value = selectedSeasonId || seasonsCache[0].id;
    select.addEventListener('change', onSeasonChange);
  }

  function onSeasonChange() {
    var select = document.getElementById('team-season-select');
    selectedSeasonId = select ? select.value : '';
    updateSeasonUrl();
    if (!teamId) {
      renderTeamDirectory(selectedSeasonId);
      return;
    }
    switchTeamSeason(selectedSeasonId);
  }

  function updateSeasonUrl() {
    if (!window.history || !window.history.replaceState) return;
    var nextParams = new URLSearchParams(window.location.search);
    if (teamId) nextParams.set('id', teamId);
    if (selectedSeasonId) nextParams.set('seasonId', selectedSeasonId);
    var query = nextParams.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
  }

  function getSeasonTeams(seasonId) {
    if (!seasonId) return Promise.resolve([]);
    if (teamsBySeason[seasonId]) return Promise.resolve(teamsBySeason[seasonId]);
    return API.getTeams(seasonId).then(function (teams) {
      teamsBySeason[seasonId] = teams || [];
      return teamsBySeason[seasonId];
    });
  }

  // --- 球隊目錄（無 ID 時顯示所有球隊列表）---
  function showTeamDirectory() {
    var main = document.querySelector('.main-content');
    if (!main) return;
    main.innerHTML = '<section class="team-directory-hero"><div class="container">' +
      '<div class="team-directory-heading">' +
        '<p class="team-section-kicker">Teams</p>' +
        '<h1 class="section-title">球隊目錄</h1>' +
      '</div>' +
      '<div class="team-season-controls team-season-controls--directory">' +
        '<label for="team-season-select" class="sr-only">選擇賽季</label>' +
        '<select id="team-season-select" class="h2h-select" aria-label="選擇賽季"></select>' +
      '</div>' +
      '<div id="team-dir" class="text-muted">載入中...</div>' +
      '</div></section>';
    populateSeasonSelect();
    renderTeamDirectory(selectedSeasonId);
  }

  function renderTeamDirectory(seasonId) {
    var dir = document.getElementById('team-dir');
    if (!dir) return;
    dir.textContent = '載入中...';
    getSeasonTeams(seasonId).then(function (teams) {
      if (!teams || teams.length === 0) { document.getElementById('team-dir').textContent = '暫無球隊資料'; return; }
      var html = '<div class="team-directory-grid">';
      teams.forEach(function (t) {
        var logoSrc = t.logo || 'images/logo.png';
        html += '<a href="team.html?id=' + encodeURIComponent(t.id) + '&seasonId=' + encodeURIComponent(seasonId || '') + '" class="team-directory-card">' +
          '<span class="team-directory-logo" aria-hidden="true"><img src="' + escapeHtml(logoSrc) + '" alt="" loading="lazy" onerror="this.src=\'images/logo.png\'"></span>' +
          '<span class="team-directory-main">' +
            '<span class="team-directory-name">' + escapeHtml(t.name || '—') + '</span>' +
            '<span class="team-directory-captain">' + escapeHtml(t.captain || '負責人 —') + '</span>' +
          '</span>' +
          '<span class="team-directory-arrow" aria-hidden="true">›</span>' +
        '</a>';
      });
      html += '</div>';
      document.getElementById('team-dir').innerHTML = html;
    }).catch(function () {
      document.getElementById('team-dir').textContent = '載入失敗';
    });
  }

  // --- 載入球隊數據 ---
  function loadTeamData() {
    setLoadingState();
    API.getTeamProfile(teamId, selectedSeasonId)
      .then(function (data) {
        if (!hasTeamDetails(data)) return loadTeamFallback(data);
        renderTeamPage(data);
      })
      .catch(function () {
        loadTeamFallback().catch(function () {
          showError(I18n.t('error.loadFailed'));
        });
      });
  }

  function setLoadingState() {
    var nameEl = document.getElementById('team-name');
    var rosterBody = document.getElementById('roster-body');
    var loadingText = document.documentElement.lang === 'en' ? 'Loading...' : '載入中...';
    if (nameEl) nameEl.textContent = loadingText;
    if (rosterBody) rosterBody.innerHTML = '<tr><td colspan="8" class="loading">' + loadingText + '</td></tr>';
  }

  function hasTeamDetails(data) {
    if (!data) return false;
    var info = data.info || data;
    return !!(info && (info.name || info.teamName || info.id) || (data.roster && data.roster.length) || data.history || data.h2h);
  }

  function renderTeamPage(data) {
    teamData = data || {};
    if (!selectedSeasonId && teamData.info && teamData.info.seasonId) selectedSeasonId = teamData.info.seasonId;
    syncSeasonSelect();
    renderTeamInfo(teamData.info || teamData);
    renderRoster(teamData.roster);
    renderHistory(teamData.history);
    renderCurrentRecord(teamData);
    populateH2HDropdown(teamData);
  }

  function loadTeamFallback(existingData) {
    return API.getSeasons().then(function (seasons) {
      var seasonList = seasons || [];
      return Promise.all(seasonList.map(function (season) {
        return API.getTeams(season.id).then(function (teams) {
          return { season: season, teams: teams || [] };
        }).catch(function () {
          return { season: season, teams: [] };
        });
      }));
    }).then(function (seasonTeams) {
      var match = null;
      for (var i = 0; i < seasonTeams.length && !match; i++) {
        var teams = seasonTeams[i].teams || [];
        for (var j = 0; j < teams.length; j++) {
          if (String(teams[j].id) === String(teamId)) {
            match = Object.assign({}, teams[j], { seasonId: seasonTeams[i].season.id });
            break;
          }
        }
      }
      if (!match) throw new Error('Team not found');
      renderTeamPage(Object.assign({}, existingData || {}, {
        info: match,
        roster: (existingData && existingData.roster) || [],
        history: (existingData && existingData.history) || [],
        h2h: (existingData && existingData.h2h) || {}
      }));
    });
  }

  function syncSeasonSelect() {
    var select = document.getElementById('team-season-select');
    if (select && selectedSeasonId) select.value = selectedSeasonId;
  }

  function switchTeamSeason(seasonId) {
    if (!seasonId) return;
    var currentName = teamData && teamData.info ? teamData.info.name : '';
    setLoadingState();
    getSeasonTeams(seasonId).then(function (teams) {
      var match = findMatchingTeamForSeason(teams, teamId, currentName);
      if (match && String(match.id) !== String(teamId)) {
        window.location.href = 'team.html?id=' + encodeURIComponent(match.id) + '&seasonId=' + encodeURIComponent(seasonId);
        return;
      }
      loadTeamData();
    }).catch(function () {
      loadTeamData();
    });
  }

  function findMatchingTeamForSeason(teams, currentTeamId, currentName) {
    var nameKey = String(currentName || '').toLowerCase();
    for (var i = 0; i < teams.length; i++) {
      if (String(teams[i].id) === String(currentTeamId)) return teams[i];
    }
    if (!nameKey) return null;
    for (var j = 0; j < teams.length; j++) {
      if (String(teams[j].name || '').toLowerCase() === nameKey) return teams[j];
    }
    return null;
  }

  // --- 渲染球隊基本資料（需求 5.1）---
  function renderTeamInfo(info) {
    var nameEl = document.getElementById('team-name');
    var logoEl = document.getElementById('team-logo');
    var captainEl = document.getElementById('team-captain');
    var descEl = document.getElementById('team-description');

    var displayName = info.name || info.teamName || '—';
    if (nameEl) nameEl.textContent = displayName;
    if (logoEl && info.logo) {
      logoEl.src = info.logo;
      logoEl.alt = displayName;
    }
    if (captainEl) captainEl.textContent = info.captain || '—';
    if (descEl) descEl.textContent = info.description || '—';

    // 更新頁面標題
    if (displayName && displayName !== '—') {
      document.title = displayName + ' — ALL-IN Basketball League';
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
        '<td>' + (p.number !== '' && p.number != null ? '#' + escapeHtml(String(p.number)) : '—') + '</td>' +
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
      var latest = findHistoryForSelectedSeason(data.history) || data.history[0];
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
    } else if (rankBadge) {
      rankBadge.textContent = '';
    }
  }

  function findHistoryForSelectedSeason(history) {
    if (!selectedSeasonId) return null;
    for (var i = 0; i < history.length; i++) {
      if (String(history[i].seasonId) === String(selectedSeasonId)) return history[i];
    }
    return null;
  }

  // --- 填充 H2H 下拉選單及綁定事件（需求 5.4）---
  function populateH2HDropdown(data) {
    var select = document.getElementById('h2h-team-select');
    if (!select) return;

    while (select.options.length > 1) {
      select.remove(1);
    }
    select.value = '';

    // 從 h2h 數據中取得可對比的球隊列表
    var h2hData = data.h2h || {};
    var teamIds = Object.keys(h2hData);
    var info = (data && (data.info || data)) || {};

    if (teamIds.length === 0) {
      // 嘗試從 API 取得同賽季球隊列表
      API.getSeasons()
        .then(function (seasons) {
          if (!seasons || seasons.length === 0) return;
          var activeSeason = info.seasonId
            ? seasons.find(function (season) { return String(season.id) === String(info.seasonId); })
            : getDefaultSeason(seasons);
          if (!activeSeason) return;
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

  function getDefaultSeason(seasons) {
    var list = seasons || [];
    for (var s1 = 0; s1 < list.length; s1++) {
      if (isActiveSeason(list[s1]) && isSeasonOne(list[s1])) return list[s1];
    }
    for (var i = list.length - 1; i >= 0; i--) {
      if (isActiveSeason(list[i])) return list[i];
    }
    return list[list.length - 1];
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
