/**
 * ALL-IN Basketball League — 球員對比頁面邏輯
 * 提供兩個下拉選單選擇球員，以並排表格及雷達圖顯示賽季平均數據對比
 * 需求：10.1, 10.2, 10.3, 10.4, 12.5
 */
(function () {
  'use strict';

  // --- 對比統計類別 ---
  var STAT_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk', 'fgPct', 'tpPct', 'ftPct'];
  var RADAR_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk'];

  // --- DOM 元素 ---
  var seasonSelect = document.getElementById('season-select');
  var player1Select = document.getElementById('player1-select');
  var player2Select = document.getElementById('player2-select');
  var resultsSection = document.getElementById('compare-results');
  var emptySection = document.getElementById('compare-empty');
  var statsBody = document.getElementById('compare-stats-body');
  var thPlayer1 = document.getElementById('compare-th-player1');
  var thPlayer2 = document.getElementById('compare-th-player2');

  // --- 狀態 ---
  var currentSeasonId = null;
  var allPlayers = [];
  var player1Data = null;
  var player2Data = null;
  var radarChart = null;

  // --- 初始化 ---
  function init() {
    loadSeasons();
    if (seasonSelect) seasonSelect.addEventListener('change', onSeasonChange);
    if (player1Select) player1Select.addEventListener('change', onPlayerChange);
    if (player2Select) player2Select.addEventListener('change', onPlayerChange);
  }

  // --- 載入賽季列表 ---
  function loadSeasons() {
    API.getSeasons()
      .then(function (seasons) {
        if (!seasons || seasons.length === 0) {
          setSelectEmpty(seasonSelect);
          return;
        }
        populateSelect(seasonSelect, seasons.map(function (s) {
          return { value: s.id, label: s.name || s.id };
        }));
        // 預設選擇 active 賽季
        var active = null;
        for (var i = 0; i < seasons.length; i++) {
          if (seasons[i].status === 'active') { active = seasons[i]; break; }
        }
        if (!active) active = seasons[seasons.length - 1];
        currentSeasonId = active.id;
        if (seasonSelect) seasonSelect.value = currentSeasonId;
        loadPlayers();
      })
      .catch(function () {
        setSelectEmpty(seasonSelect);
      });
  }

  function onSeasonChange() {
    currentSeasonId = seasonSelect ? seasonSelect.value : null;
    if (currentSeasonId) {
      loadPlayers();
    }
  }

  // --- 載入球員列表 ---
  function loadPlayers() {
    // 先載入所有球隊，再載入每隊球員
    API.getTeams(currentSeasonId)
      .then(function (teams) {
        if (!teams || teams.length === 0) {
          allPlayers = [];
          setSelectEmpty(player1Select);
          setSelectEmpty(player2Select);
          return;
        }
        var promises = teams.map(function (team) {
          return API.getPlayers(team.id).then(function (players) {
            return (players || []).map(function (p) {
              p._teamName = team.name || '';
              return p;
            });
          }).catch(function () { return []; });
        });
        return Promise.all(promises).then(function (results) {
          allPlayers = [];
          results.forEach(function (arr) {
            allPlayers = allPlayers.concat(arr);
          });
          // 按名稱排序
          allPlayers.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
          });
          populatePlayerSelects();
        });
      })
      .catch(function () {
        allPlayers = [];
        setSelectEmpty(player1Select);
        setSelectEmpty(player2Select);
      });
  }

  function populatePlayerSelects() {
    var options = allPlayers.map(function (p) {
      var label = (p.name || '—');
      if (p._teamName) label += ' (' + p._teamName + ')';
      return { value: p.id, label: label };
    });
    populateSelect(player1Select, options, I18n.t('compare.selectPlayer1'));
    populateSelect(player2Select, options, I18n.t('compare.selectPlayer2'));
    // Reset comparison
    showEmpty();
  }

  // --- 球員選擇變更 ---
  function onPlayerChange() {
    var p1Id = player1Select ? player1Select.value : '';
    var p2Id = player2Select ? player2Select.value : '';

    if (!p1Id || !p2Id || p1Id === p2Id) {
      showEmpty();
      return;
    }

    // 載入兩位球員的檔案數據
    Promise.all([
      API.getPlayerProfile(p1Id),
      API.getPlayerProfile(p2Id)
    ]).then(function (results) {
      player1Data = results[0];
      player2Data = results[1];
      renderComparison();
    }).catch(function () {
      showEmpty();
    });
  }

  // --- 渲染對比結果 ---
  function renderComparison() {
    if (!player1Data || !player2Data) {
      showEmpty();
      return;
    }

    // 顯示結果區域
    if (resultsSection) resultsSection.style.display = '';
    if (emptySection) emptySection.style.display = 'none';

    var p1Name = getPlayerName(player1Data);
    var p2Name = getPlayerName(player2Data);

    // 更新表頭
    if (thPlayer1) thPlayer1.textContent = p1Name;
    if (thPlayer2) thPlayer2.textContent = p2Name;

    var p1Avg = getSeasonAvg(player1Data);
    var p2Avg = getSeasonAvg(player2Data);

    // 渲染統計表格
    renderStatsTable(p1Avg, p2Avg);

    // 渲染雷達圖
    renderRadarChart(p1Name, p2Name, p1Avg, p2Avg);
  }

  function renderStatsTable(p1Avg, p2Avg) {
    if (!statsBody) return;

    var rows = STAT_KEYS.map(function (key) {
      var label = I18n.t('table.' + key) || key.toUpperCase();
      var v1 = getStatValue(p1Avg, key);
      var v2 = getStatValue(p2Avg, key);
      var isPct = key.indexOf('Pct') !== -1;
      var d1 = isPct ? formatPct(v1) : formatNum(v1);
      var d2 = isPct ? formatPct(v2) : formatNum(v2);

      // Highlight the higher value
      var cls1 = '', cls2 = '';
      if (v1 > v2) { cls1 = ' class="text-accent"'; }
      else if (v2 > v1) { cls2 = ' class="text-accent"'; }

      return '<tr>' +
        '<td>' + escapeHtml(label) + '</td>' +
        '<td' + cls1 + '>' + d1 + '</td>' +
        '<td' + cls2 + '>' + d2 + '</td>' +
        '</tr>';
    });

    statsBody.innerHTML = rows.join('');
  }

  function renderRadarChart(p1Name, p2Name, p1Avg, p2Avg) {
    var labels = RADAR_KEYS.map(function (key) {
      return I18n.t('table.' + key) || key.toUpperCase();
    });

    var p1Values = RADAR_KEYS.map(function (key) { return getStatValue(p1Avg, key); });
    var p2Values = RADAR_KEYS.map(function (key) { return getStatValue(p2Avg, key); });

    // Destroy existing chart
    if (radarChart) {
      radarChart.destroy();
      radarChart = null;
    }

    radarChart = Charts.createRadarChart('compare-radar-chart', p1Values, p2Values, labels);

    // Update dataset labels with player names
    if (radarChart && radarChart.data && radarChart.data.datasets) {
      if (radarChart.data.datasets[0]) radarChart.data.datasets[0].label = p1Name;
      if (radarChart.data.datasets[1]) radarChart.data.datasets[1].label = p2Name;
      radarChart.update();
    }
  }

  // --- 工具函數 ---

  function getPlayerName(profileData) {
    if (!profileData) return '—';
    if (profileData.info) return profileData.info.name || '—';
    return profileData.name || '—';
  }

  function getSeasonAvg(profileData) {
    if (!profileData) return {};
    return profileData.seasonAvg || {};
  }

  function getStatValue(avg, key) {
    if (!avg) return 0;
    // Map our keys to possible API field names
    var mappings = {
      pts: ['pts', 'avgPts', 'ppg'],
      reb: ['reb', 'avgReb', 'rpg'],
      ast: ['ast', 'avgAst', 'apg'],
      stl: ['stl', 'avgStl', 'spg'],
      blk: ['blk', 'avgBlk', 'bpg'],
      fgPct: ['fgPct', 'fg_pct', 'fgPercent'],
      tpPct: ['tpPct', 'tp_pct', 'tpPercent', 'threePct'],
      ftPct: ['ftPct', 'ft_pct', 'ftPercent']
    };
    var keys = mappings[key] || [key];
    for (var i = 0; i < keys.length; i++) {
      if (avg[keys[i]] != null) return Number(avg[keys[i]]) || 0;
    }
    return 0;
  }

  function formatNum(val) {
    if (val == null || isNaN(val)) return '0.0';
    return Number(val).toFixed(1);
  }

  function formatPct(val) {
    if (val == null || isNaN(val)) return '0.0%';
    var num = Number(val);
    // If value is between 0 and 1, convert to percentage
    if (num > 0 && num < 1) num = num * 100;
    return num.toFixed(1) + '%';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function populateSelect(selectEl, options, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    var defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = placeholder || '—';
    selectEl.appendChild(defaultOpt);
    options.forEach(function (opt) {
      var el = document.createElement('option');
      el.value = opt.value;
      el.textContent = opt.label;
      selectEl.appendChild(el);
    });
  }

  function setSelectEmpty(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">' + I18n.t('common.noData') + '</option>';
  }

  function showEmpty() {
    if (resultsSection) resultsSection.style.display = 'none';
    if (emptySection) emptySection.style.display = '';
    player1Data = null;
    player2Data = null;
    if (radarChart) {
      radarChart.destroy();
      radarChart = null;
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
