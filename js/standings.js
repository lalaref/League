/**
 * ALL-IN Basketball League — 統計排行榜頁面邏輯
 * 載入各類別排行榜數據並以表格及長條圖呈現
 * 需求：6.1, 6.2, 6.3, 6.4, 6.5, 12.2, 14.6
 */
(function () {
  'use strict';

  // --- 排行榜類別定義 ---
  var BASIC_CATEGORIES = ['pts', 'reb', 'ast', 'stl', 'blk'];
  var SHOOTING_CATEGORIES = ['fg_pct', 'tp_pct', 'ft_pct'];
  var ADVANCED_CATEGORIES = [];
  var ALL_CATEGORIES = BASIC_CATEGORIES.concat(SHOOTING_CATEGORIES).concat(ADVANCED_CATEGORIES);

  // 百分比類別（顯示為百分比格式）
  var PCT_CATEGORIES = ['fg_pct', 'tp_pct', 'ft_pct'];

  // --- DOM 元素 ---
  var seasonSelect = document.getElementById('season-select');

  // --- 狀態 ---
  var currentSeasonId = null;
  var chartInstances = {};

  // --- 初始化 ---
  function init() {
    setupTabs();
    loadSeasons();
    if (seasonSelect) {
      seasonSelect.addEventListener('change', onSeasonChange);
    }
  }

  // --- 分頁切換 ---
  function setupTabs() {
    var tabBtns = document.querySelectorAll('.tabs .tab-btn');
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
        // 更新面板顯示
        var panels = document.querySelectorAll('.tab-panel');
        panels.forEach(function (p) { p.classList.remove('active'); });
        var target = document.getElementById('tab-' + targetTab);
        if (target) target.classList.add('active');
      });
    });
  }

  // --- 載入賽季列表 ---
  function loadSeasons() {
    API.getSeasons()
      .then(function (seasons) {
        if (!seasons || seasons.length === 0) {
          if (seasonSelect) {
            seasonSelect.innerHTML = '<option value="">' + I18n.t('common.noData') + '</option>';
          }
          showEmptyAll();
          return;
        }
        populateSeasonSelect(seasons);
        // 預設選擇 active 賽季
        var active = null;
        for (var i = 0; i < seasons.length; i++) {
          if (seasons[i].status === 'active') { active = seasons[i]; break; }
        }
        if (!active) active = seasons[seasons.length - 1];
        currentSeasonId = active.id;
        if (seasonSelect) seasonSelect.value = currentSeasonId;
        loadAllLeaderboards();
      })
      .catch(function () {
        if (seasonSelect) {
          seasonSelect.innerHTML = '<option value="">' + I18n.t('error.loadFailed') + '</option>';
        }
        showEmptyAll();
      });
  }

  function populateSeasonSelect(seasons) {
    if (!seasonSelect) return;
    seasonSelect.innerHTML = '';
    seasons.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name || s.id;
      seasonSelect.appendChild(opt);
    });
  }

  function onSeasonChange() {
    currentSeasonId = seasonSelect ? seasonSelect.value : null;
    if (currentSeasonId) loadAllLeaderboards();
  }

  // --- 載入所有排行榜 ---
  function loadAllLeaderboards() {
    ALL_CATEGORIES.forEach(function (cat) {
      loadLeaderboard(cat);
    });
  }

  /**
   * 載入單一類別排行榜
   * @param {string} category - 類別代碼
   */
  function loadLeaderboard(category) {
    var tbody = document.getElementById('leaders-' + category);
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="loading">' + I18n.t('common.loading') + '</td></tr>';

    API.getLeaders(currentSeasonId, category)
      .then(function (leaders) {
        if (!leaders || leaders.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-muted">' + I18n.t('common.noData') + '</td></tr>';
          renderChart(category, [], []);
          return;
        }
        // 取前 10 名
        var top10 = leaders.slice(0, 10);
        renderTable(tbody, top10, category);
        // 渲染長條圖（取前 5 名以保持可讀性）
        var chartData = top10.slice(0, 5);
        var labels = chartData.map(function (l) { return l.playerName || l.player || l.name || '—'; });
        var values = chartData.map(function (l) { return l.value != null ? l.value : 0; });
        renderChart(category, labels, values);
      })
      .catch(function () {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted">' + I18n.t('error.loadFailed') +
          ' <button class="btn btn-outline btn-sm" onclick="location.reload()">' + I18n.t('common.retry') + '</button></td></tr>';
        renderChart(category, [], []);
      });
  }

  /**
   * 渲染排行榜表格
   */
  function renderTable(tbody, leaders, category) {
    var isPct = PCT_CATEGORIES.indexOf(category) !== -1;
    tbody.innerHTML = leaders.map(function (leader, idx) {
      var rank = leader.rank != null ? leader.rank : (idx + 1);
      var name = escapeHtml(leader.playerName || leader.player || leader.name || '—');
      var team = escapeHtml(leader.teamName || leader.team || '—');
      var value = leader.value != null ? leader.value : 0;
      var displayValue = isPct ? formatPct(value) : formatNum(value);

      // Link player name to profile if playerId available
      var nameHtml = leader.playerId
        ? '<a href="player.html?id=' + encodeURIComponent(leader.playerId) + '">' + name + '</a>'
        : name;

      return '<tr>' +
        '<td>' + rank + '</td>' +
        '<td>' + nameHtml + '</td>' +
        '<td>' + team + '</td>' +
        '<td>' + displayValue + '</td>' +
        '</tr>';
    }).join('');
  }

  /**
   * 渲染或更新長條圖
   */
  function renderChart(category, labels, values) {
    var canvasId = 'chart-' + category;
    // 銷毀舊圖表
    if (chartInstances[category]) {
      chartInstances[category].destroy();
      chartInstances[category] = null;
    }
    if (labels.length === 0) return;
    var chart = Charts.createBarChart(canvasId, labels, values);
    if (chart) chartInstances[category] = chart;
  }

  // --- 格式化工具 ---
  function formatNum(val) {
    if (val == null || isNaN(val)) return '0.0';
    return Number(val).toFixed(1);
  }

  function formatPct(val) {
    if (val == null || isNaN(val)) return '0.0%';
    // 如果值已經是百分比形式（如 45.2），直接顯示
    // 如果值是小數形式（如 0.452），乘以 100
    var num = Number(val);
    if (num > 0 && num < 1) num = num * 100;
    return num.toFixed(1) + '%';
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

  // --- 全部顯示空狀態 ---
  function showEmptyAll() {
    ALL_CATEGORIES.forEach(function (cat) {
      var tbody = document.getElementById('leaders-' + cat);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted">' + I18n.t('common.noData') + '</td></tr>';
      }
    });
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
