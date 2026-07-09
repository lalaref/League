/**
 * ALL-IN Basketball League — 統計排行榜頁面邏輯
 * 載入各類別排行榜數據並以表格及長條圖呈現
 * 需求：6.1, 6.2, 6.3, 6.4, 6.5, 12.2, 14.6
 */
(function () {
  'use strict';

  // --- 排行榜類別定義 ---
  var BASIC_CATEGORIES = ['pts', 'tpm', 'reb', 'ast', 'stl', 'blk'];
  var SHOOTING_CATEGORIES = ['fg_pct', 'tp_pct', 'ft_pct'];
  var ADVANCED_CATEGORIES = ['per', 'tsPct', 'usgPct'];
  var ALL_CATEGORIES = BASIC_CATEGORIES.concat(SHOOTING_CATEGORIES).concat(ADVANCED_CATEGORIES);

  // 百分比類別（顯示為百分比格式）
  var PCT_CATEGORIES = ['fg_pct', 'tp_pct', 'ft_pct', 'tsPct', 'usgPct'];

  // 累計類別（以全季總數排名，不以場均排名）
  var TOTAL_CATEGORIES = ['pts', 'tpm', 'reb', 'ast', 'stl', 'blk'];

  // --- DOM 元素 ---
  var seasonSelect = document.getElementById('season-select');

  // --- 狀態 ---
  var currentSeasonId = null;
  var currentSeason = null;
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
        // 預設選擇仍在進行中的 Season 1；如果沒有，使用最新 active
        var active = (typeof SeasonRules !== 'undefined') ? SeasonRules.getDefaultSeason(seasons) : null;
        if (!active) active = seasons[seasons.length - 1];
        currentSeason = active;
        currentSeasonId = active.id;
        if (seasonSelect) seasonSelect.value = currentSeasonId;
        loadAllLeaderboards();
        loadLeaderCards();
        loadTeamStandings();
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
    currentSeason = {
      id: currentSeasonId,
      name: seasonSelect && seasonSelect.options[seasonSelect.selectedIndex] ? seasonSelect.options[seasonSelect.selectedIndex].textContent : currentSeasonId
    };
    if (currentSeasonId) {
      loadAllLeaderboards();
      loadLeaderCards();
      loadTeamStandings();
    }
  }

  // --- 載入所有排行榜 ---
  function loadAllLeaderboards() {
    ALL_CATEGORIES.forEach(function (cat) {
      loadLeaderboard(cat);
    });
  }

  // ─── Stat Leader Photo Cards ───────────────────────────────────────────────

  var LEADER_CARD_CATS = [
    { cat: 'pts', abbr: 'PTS', label: 'POINTS',   color: '#cc0000' },
    { cat: 'reb', abbr: 'REB', label: 'REBOUNDS', color: '#1a6fd4' },
    { cat: 'ast', abbr: 'AST', label: 'ASSISTS',  color: '#0ea854' },
    { cat: 'stl', abbr: 'STL', label: 'STEALS',   color: '#d47a00' },
    { cat: 'blk', abbr: 'BLK', label: 'BLOCKS',   color: '#9b27d4' },
    { cat: 'tpm', abbr: '3PM', label: '3-POINTERS', color: '#00aac4' }
  ];

  var SILHOUETTE_SVG = '<svg viewBox="0 0 100 200" xmlns="http://www.w3.org/2000/svg" fill="white" opacity=".18">'
    + '<circle cx="50" cy="20" r="15"/>'
    + '<path d="M30,42 Q18,35 10,12 L17,9 Q22,30 38,46Z"/>'
    + '<circle cx="10" cy="11" r="10"/>'
    + '<path d="M70,42 Q75,32 82,18 L89,21 Q84,37 64,47Z"/>'
    + '<circle cx="90" cy="10" r="10"/>'
    + '<ellipse cx="50" cy="72" rx="20" ry="28"/>'
    + '<path d="M30,96 L22,158 L36,158 L50,115 L64,158 L78,158 L70,96Z"/>'
    + '</svg>';

  function loadLeaderCards() {
    var container = document.getElementById('stat-leader-cards');
    if (!container) return;
    container.innerHTML = '<div class="sl-loading">載入中...</div>';

    Promise.all(LEADER_CARD_CATS.map(function (cfg) {
      return API.getLeaders(currentSeasonId, cfg.cat)
        .then(function (leaders) {
          var normalized = normalizeLeaders(leaders || [], cfg.cat);
          return { cfg: cfg, leader: normalized[0] || null };
        })
        .catch(function () { return { cfg: cfg, leader: null }; });
    })).then(function (results) {
      container.innerHTML = results.map(function (r) {
        return renderLeaderCard(r.cfg, r.leader);
      }).join('');
    });
  }

  function renderLeaderCard(cfg, leader) {
    var photo      = leader && (leader.leaderPhoto || leader.photo);
    var hasPhoto   = !!photo;
    var value      = leader ? getDisplayValue(leader, cfg.cat) : 0;
    var displayVal = (value % 1 === 0) ? value.toFixed(0) : value.toFixed(1);
    var name       = leader ? escapeHtml(leader.playerName || '—') : '—';
    var team       = leader ? escapeHtml(leader.teamName || '—') : '—';
    var jersey     = leader && (leader.number !== '' && leader.number != null) ? ' #' + escapeHtml(String(leader.number)) : '';
    var pid        = leader && leader.playerId ? encodeURIComponent(leader.playerId) : null;

    var photoHtml = hasPhoto
      ? '<img class="sl-photo" src="' + escapeHtml(photo) + '" alt="' + name + '" loading="lazy" onerror="this.style.display=\'none\'">'
      : SILHOUETTE_SVG;

    var cardTag = pid ? 'a' : 'div';
    var cardHref = pid ? ' href="player.html?id=' + pid + '"' : '';
    var cardClass = pid ? 'sl-card sl-card-link' : 'sl-card';

    return '<' + cardTag + cardHref + ' class="' + cardClass + '" style="--sl-color:' + cfg.color + '" role="article" aria-label="' + cfg.label + ' leader">'
      + '<div class="sl-photo-area">'
      + photoHtml
      + '<div class="sl-photo-gradient"></div>'
      + '<div class="sl-badge">' + cfg.abbr + '</div>'
      + '<div class="sl-num">' + (leader ? displayVal : '—') + '</div>'
      + '</div>'
      + '<div class="sl-info">'
      + '<span class="sl-cat-name">' + cfg.label + '</span>'
      + '<span class="sl-player-name">' + name + '</span>'
      + '<span class="sl-team">' + team + jersey + '</span>'
      + '</div>'
      + '</' + cardTag + '>';
  }

  // ─── Team Standings ────────────────────────────────────────────────────────

  function loadTeamStandings() {
    var tbody = document.querySelector('#standings-page-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="loading">載入中...</td></tr>';

    Promise.all([
      API.getGames(currentSeasonId),
      API.getTeams(currentSeasonId)
    ]).then(function (results) {
      var games = results[0] || [];
      var teams = results[1] || [];
      if (teams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-muted">' + I18n.t('common.noData') + '</td></tr>';
        return;
      }
      var standings = _computeStandings(games, teams);
      tbody.innerHTML = _renderStandingsRows(standings, teams, games);
    }).catch(function () {
      tbody.innerHTML = '<tr><td colspan="8" class="text-muted">' + I18n.t('error.loadFailed')
        + ' <button class="btn btn-outline btn-sm" onclick="location.reload()">' + I18n.t('common.retry') + '</button></td></tr>';
    });
  }

  function _computeStandings(games, teams) {
    var table = {};
    teams.forEach(function (t) {
      table[t.id] = { id: t.id, teamName: t.name || t.teamName || t.id,
        division: (typeof SeasonRules !== 'undefined') ? SeasonRules.getTeamDivision(t) : '',
        played: 0, wins: 0, draws: 0, losses: 0, forfeits: 0,
        pointsFor: 0, pointsAgainst: 0, diff: 0, points: 0 };
    });
    var allResults = [];
    games.forEach(function (g) {
      if (g.status !== 'completed') return;
      if (!table[g.homeTeamId] || !table[g.awayTeamId]) return;
      var hasQ = g.homeQ1 || g.homeQ2 || g.homeQ3 || g.homeQ4 || g.awayQ1 || g.awayQ2 || g.awayQ3 || g.awayQ4;
      var hs, as;
      if (hasQ) {
        hs = (parseInt(g.homeQ1,10)||0)+(parseInt(g.homeQ2,10)||0)+(parseInt(g.homeQ3,10)||0)+(parseInt(g.homeQ4,10)||0);
        as = (parseInt(g.awayQ1,10)||0)+(parseInt(g.awayQ2,10)||0)+(parseInt(g.awayQ3,10)||0)+(parseInt(g.awayQ4,10)||0);
      } else { hs = parseInt(g.homeScore,10)||0; as = parseInt(g.awayScore,10)||0; }
      var ff = g.forfeit || g.walkover || '';
      var isFf = ff==='home'||ff==='away';
      allResults.push({ homeId:g.homeTeamId, awayId:g.awayTeamId, homeScore:hs, awayScore:as, isForfeit:isFf, forfeitSide:ff });
      table[g.homeTeamId].played++; table[g.awayTeamId].played++;
      table[g.homeTeamId].pointsFor+=hs; table[g.homeTeamId].pointsAgainst+=as;
      table[g.awayTeamId].pointsFor+=as; table[g.awayTeamId].pointsAgainst+=hs;
      if (isFf) {
        if (ff==='home') { table[g.awayTeamId].wins++; table[g.awayTeamId].points+=3; table[g.homeTeamId].forfeits++; }
        else { table[g.homeTeamId].wins++; table[g.homeTeamId].points+=3; table[g.awayTeamId].forfeits++; }
      } else if (hs>as) { table[g.homeTeamId].wins++; table[g.homeTeamId].points+=3; table[g.awayTeamId].losses++; table[g.awayTeamId].points+=1; }
      else if (as>hs) { table[g.awayTeamId].wins++; table[g.awayTeamId].points+=3; table[g.homeTeamId].losses++; table[g.homeTeamId].points+=1; }
      else { table[g.homeTeamId].draws++; table[g.homeTeamId].points+=2; table[g.awayTeamId].draws++; table[g.awayTeamId].points+=2; }
    });
    var rows = Object.keys(table).map(function (id) { var t=table[id]; t.diff=t.pointsFor-t.pointsAgainst; return t; });
    rows.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      return b.diff - a.diff;
    });
    // Tie-breaker: point differential
    return rows;
  }

  function _renderStandingsRows(standings, teams, games) {
    var context = (typeof SeasonRules !== 'undefined') ? SeasonRules.buildContext(teams || [], games || [], currentSeason || currentSeasonId) : null;
    if (!context || !context.rules.isDivisionRoundRobin) {
      return standings.map(function (team, idx) { return _renderStandingRow(team, idx + 1); }).join('');
    }
    var byId = {};
    standings.forEach(function (team) { byId[team.id] = team; });
    return SeasonRules.getDivisionNames(context).map(function (division) {
      var rows = (context.divisions[division] || []).map(function (id) { return byId[id]; }).filter(Boolean);
      rows.sort(function (a, b) {
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        return a.teamName.localeCompare(b.teamName);
      });
      var html = '<tr class="standings-division-row"><td colspan="8">' + escapeHtml(division) + ' · ' + rows.length + ' teams</td></tr>';
      html += rows.map(function (team, idx) { return _renderStandingRow(team, idx + 1); }).join('');
      return html;
    }).join('');
  }

  function _renderStandingRow(team, rank) {
    var diff = team.diff > 0 ? '+' + team.diff : team.diff;
    return '<tr>'
      + '<td>' + rank + '</td>'
      + '<td>' + escapeHtml(team.teamName) + '</td>'
      + '<td>' + team.played + '</td>'
      + '<td>' + team.wins + '</td>'
      + '<td>' + team.draws + '</td>'
      + '<td>' + team.losses + '</td>'
      + '<td>' + diff + '</td>'
      + '<td class="text-accent">' + team.points + '</td>'
      + '</tr>';
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
          if (ADVANCED_CATEGORIES.indexOf(category) !== -1 && leaders[0].category !== category) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-muted">請先更新後端 Code.gs 以載入進階數據</td></tr>';
            renderChart(category, [], []);
            return;
          }
        var normalizedLeaders = normalizeLeaders(leaders, category);
        // 取前 10 名
        var top10 = normalizedLeaders.slice(0, 10);
        renderTable(tbody, top10, category);
        // 渲染長條圖（取前 5 名以保持可讀性）
        var chartData = top10.slice(0, 5);
        var labels = chartData.map(function (l) { return l.playerName || l.player || l.name || '—'; });
        var values = chartData.map(function (l) { return getDisplayValue(l, category); });
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
      var value = getDisplayValue(leader, category);
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
    try {
      var canvasId = 'chart-' + category;
      if (chartInstances[category]) {
        chartInstances[category].destroy();
        chartInstances[category] = null;
      }
      if (labels.length === 0) {
        renderFallbackBarChart(category, [], []);
        return;
      }
      if (typeof Chart === 'undefined' || typeof Charts === 'undefined' || !Charts.createBarChart) {
        renderFallbackBarChart(category, labels, values);
        return;
      }
      removeFallbackBarChart(category);
      var chart = Charts.createBarChart(canvasId, labels, values);
      if (chart) chartInstances[category] = chart;
    } catch (err) {
      chartInstances[category] = null;
      renderFallbackBarChart(category, labels, values);
    }
  }

  function renderFallbackBarChart(category, labels, values) {
    var canvas = document.getElementById('chart-' + category);
    if (!canvas || !canvas.parentElement) return;
    var wrapper = canvas.parentElement;
    canvas.style.display = 'none';
    var existing = wrapper.querySelector('.fallback-bar-chart');
    if (!labels || labels.length === 0) {
      if (existing) existing.remove();
      return;
    }
    var max = values.reduce(function (highest, value) {
      value = Number(value) || 0;
      return value > highest ? value : highest;
    }, 0) || 1;
    var html = labels.map(function (label, idx) {
      var value = Number(values[idx]) || 0;
      var width = Math.max(4, Math.round(value / max * 100));
      return '<div class="fallback-bar-row">'
        + '<div class="fallback-bar-name">' + escapeHtml(label) + '</div>'
        + '<div class="fallback-bar-track"><div class="fallback-bar-fill" style="width:' + width + '%"></div></div>'
        + '<div class="fallback-bar-value">' + (PCT_CATEGORIES.indexOf(category) !== -1 ? formatPct(value) : formatNum(value)) + '</div>'
        + '</div>';
    }).join('');
    if (!existing) {
      existing = document.createElement('div');
      existing.className = 'fallback-bar-chart';
      wrapper.appendChild(existing);
    }
    existing.innerHTML = html;
  }

  function removeFallbackBarChart(category) {
    var canvas = document.getElementById('chart-' + category);
    if (!canvas || !canvas.parentElement) return;
    canvas.style.display = '';
    var existing = canvas.parentElement.querySelector('.fallback-bar-chart');
    if (existing) existing.remove();
  }

  function normalizeLeaders(leaders, category) {
    var normalized = (leaders || []).map(function (leader) {
      var copy = Object.assign({}, leader);
      copy.displayValue = getDisplayValue(copy, category);
      return copy;
    });
    if (TOTAL_CATEGORIES.indexOf(category) !== -1 || category === 'tpm') {
      normalized.sort(function (a, b) { return getDisplayValue(b, category) - getDisplayValue(a, category); });
      normalized.forEach(function (leader, idx) { leader.rank = idx + 1; });
    }
    return normalized;
  }

  function getDisplayValue(leader, category) {
    if (!leader) return 0;
    if (leader.displayValue != null) return Number(leader.displayValue) || 0;
    var value = leader.value != null ? Number(leader.value) : 0;
    if (TOTAL_CATEGORIES.indexOf(category) === -1) return value || 0;
    if (leader.statMode === 'total' || leader.valueType === 'total') return value || 0;
    if (leader.total != null) return Number(leader.total) || 0;
    if (leader.totalValue != null) return Number(leader.totalValue) || 0;
    return Math.round((value || 0) * (Number(leader.gamesPlayed) || 0));
  }

  // --- 格式化工具 ---
  function formatNum(val) {
    if (val == null || isNaN(val)) return '0';
    var num = Number(val);
    return (num % 1 === 0) ? num.toFixed(0) : num.toFixed(1);
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
