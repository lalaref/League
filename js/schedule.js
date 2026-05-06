/**
 * ALL-IN Basketball League — 賽程表及季後賽頁面
 * 顯示完整賽程列表及季後賽淘汰賽樹狀圖
 * 需求：8.2, 8.4, 12.9
 */
(function () {
  'use strict';

  // --- DOM 元素 ---
  var seasonSelect = document.getElementById('season-select');
  var tabBtns = document.querySelectorAll('.tab-btn');
  var tabPanels = document.querySelectorAll('.tab-panel');

  // 賽程列表
  var scheduleLoading = document.getElementById('schedule-loading');
  var scheduleEmpty = document.getElementById('schedule-empty');
  var scheduleList = document.getElementById('schedule-list');
  var scheduleTbody = document.getElementById('schedule-tbody');

  // 季後賽
  var playoffsLoading = document.getElementById('playoffs-loading');
  var playoffsEmpty = document.getElementById('playoffs-empty');
  var playoffsBracketWrapper = document.getElementById('playoffs-bracket-wrapper');
  var playoffsBracket = document.getElementById('playoffs-bracket');

  var currentSeasonId = '';

  // --- 初始化 ---
  function init() {
    _bindTabs();
    _loadSeasons();
    if (seasonSelect) {
      seasonSelect.addEventListener('change', function () {
        currentSeasonId = seasonSelect.value;
        _loadCurrentTab();
      });
    }
  }

  // --- 分頁切換 ---
  function _bindTabs() {
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetTab = btn.getAttribute('data-tab');
        tabBtns.forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        tabPanels.forEach(function (panel) {
          panel.classList.remove('active');
        });
        var targetPanel = document.getElementById('tab-' + targetTab);
        if (targetPanel) targetPanel.classList.add('active');
        _loadCurrentTab();
      });
    });
  }

  function _getActiveTab() {
    var active = document.querySelector('.tab-btn.active');
    return active ? active.getAttribute('data-tab') : 'schedule';
  }

  function _loadCurrentTab() {
    var tab = _getActiveTab();
    if (tab === 'schedule') {
      _loadSchedule();
    } else if (tab === 'playoffs') {
      _loadPlayoffs();
    }
  }

  // --- 載入賽季列表 ---
  function _loadSeasons() {
    API.getSeasons()
      .then(function (seasons) {
        if (!seasonSelect) return;
        seasonSelect.innerHTML = '';
        if (!seasons || seasons.length === 0) {
          seasonSelect.innerHTML = '<option value="">' + (I18n.t('common.noData')) + '</option>';
          return;
        }
        seasons.forEach(function (s, i) {
          var opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name;
          if (i === 0) opt.selected = true;
          seasonSelect.appendChild(opt);
        });
        currentSeasonId = seasons[0].id;
        _loadCurrentTab();
      })
      .catch(function () {
        if (seasonSelect) {
          seasonSelect.innerHTML = '<option value="">' + (I18n.t('error.loadFailed')) + '</option>';
        }
      });
  }

  // --- 載入賽程列表 ---
  // Team data cache for jersey colors
  var _teamsCache = [];

  function _loadSchedule() {
    if (!currentSeasonId) return;
    _showEl(scheduleLoading);
    _hideEl(scheduleEmpty);
    _hideEl(scheduleList);

    Promise.all([
      API.getSchedule(currentSeasonId),
      API.getTeams(currentSeasonId)
    ])
      .then(function (results) {
        var games = results[0];
        var teams = results[1] || [];
        _teamsCache = teams;
        _hideEl(scheduleLoading);
        if (!games || games.length === 0) {
          _showEl(scheduleEmpty);
          return;
        }
        // Client-side team name resolution fallback + jersey color mapping
        if (teams.length > 0) {
          var teamMap = {};
          teams.forEach(function (t) { teamMap[t.id] = t; });
          games.forEach(function (g) {
            var homeTeam = teamMap[g.homeTeamId];
            var awayTeam = teamMap[g.awayTeamId];
            if (!g.homeTeamName && homeTeam) g.homeTeamName = homeTeam.name || '';
            if (!g.awayTeamName && awayTeam) g.awayTeamName = awayTeam.name || '';
            // Attach jersey colors
            g._homeJersey = homeTeam ? (homeTeam.jerseyHome || '') : '';
            g._awayJersey = awayTeam ? (awayTeam.jerseyAway || '') : '';
          });
        }
        _renderScheduleTable(games);
        _showEl(scheduleList);
      })
      .catch(function () {
        _hideEl(scheduleLoading);
        _showEl(scheduleEmpty);
      });
  }

  function _renderScheduleTable(games) {
    if (!scheduleTbody) return;
    scheduleTbody.innerHTML = '';

    // Sort by date descending (most recent first)
    var sorted = games.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || '');
    });

    sorted.forEach(function (game) {
      // Skip cancelled games on public schedule
      if (game.status === 'cancelled') return;

      var tr = document.createElement('tr');
      var homeName = game.homeTeamName || game.home || game.homeTeam || '—';
      var awayName = game.awayTeamName || game.away || game.awayTeam || '—';

      // Build matchup with jersey color badges (swatch only, no text)
      var homeJersey = game._homeJersey || '';
      var awayJersey = game._awayJersey || '';
      var homeJerseyHtml = homeJersey ? ' <span class="jersey-badge" title="主場球衣: ' + _escHtml(homeJersey) + '" style="' + _jerseyStyle(homeJersey) + '"></span>' : '';
      var awayJerseyHtml = awayJersey ? ' <span class="jersey-badge" title="客場球衣: ' + _escHtml(awayJersey) + '" style="' + _jerseyStyle(awayJersey) + '"></span>' : '';

      var matchupHtml = _escHtml(homeName) + homeJerseyHtml + ' vs ' + _escHtml(awayName) + awayJerseyHtml;

      var result = '';
      if (game.status === 'cancelled') {
        result = '<span class="text-cancelled">' + I18n.t('admin.cancelled') + '</span>';
      } else if (game.status === 'completed') {
        // Use Q1-Q4 sum as source of truth when quarter data exists (same logic as dashboard.js)
        var hasQuarters = game.homeQ1 || game.homeQ2 || game.homeQ3 || game.homeQ4 ||
                          game.awayQ1 || game.awayQ2 || game.awayQ3 || game.awayQ4;
        var hs, as_;
        if (hasQuarters) {
          hs  = (parseInt(game.homeQ1, 10) || 0) + (parseInt(game.homeQ2, 10) || 0) +
                (parseInt(game.homeQ3, 10) || 0) + (parseInt(game.homeQ4, 10) || 0);
          as_ = (parseInt(game.awayQ1, 10) || 0) + (parseInt(game.awayQ2, 10) || 0) +
                (parseInt(game.awayQ3, 10) || 0) + (parseInt(game.awayQ4, 10) || 0);
        } else {
          hs  = game.homeScore;
          as_ = game.awayScore;
        }
        if (hs != null && as_ != null) {
          result = hs + ' - ' + as_;
        } else {
          result = I18n.t('schedule.upcoming');
        }
      } else if (game.result) {
        result = game.result;
      } else {
        result = I18n.t('schedule.upcoming');
      }

      tr.innerHTML =
        '<td>' + _escHtml(Utils.formatDateWithDay(game.date)) + '</td>' +
        '<td>' + _escHtml(Utils.formatTime(game.time)) + '</td>' +
        '<td>' + _escHtml(game.venue || '—') + '</td>' +
        '<td>' + matchupHtml + '</td>' +
        '<td>' + _escHtml(result) + '</td>';

      scheduleTbody.appendChild(tr);
    });
  }

  /**
   * Generate inline style for jersey color badge.
   * Supports hex colors (#fff, #ffffff) and Chinese color names.
   */
  function _jerseyStyle(color) {
    if (!color) return '';
    var colorMap = {
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
    var bg = colorMap[color] || (color.charAt(0) === '#' ? color : '');
    if (!bg) return 'display:none';
    // Add border for light colors
    var border = (bg === '#ffffff' || bg === '#cbd5e0' || bg === '#ecc94b') ? 'border:1px solid rgba(0,0,0,0.3);' : 'border:1px solid rgba(255,255,255,0.2);';
    return 'background-color:' + bg + ';' + border;
  }

  // --- 載入季後賽對陣 ---
  function _loadPlayoffs() {
    if (!currentSeasonId) return;
    _showEl(playoffsLoading);
    _hideEl(playoffsEmpty);
    _hideEl(playoffsBracketWrapper);

    Promise.all([
      API.getPlayoffs(currentSeasonId),
      API.getTeams(currentSeasonId)
    ])
      .then(function (results) {
        var data = results[0];
        var teams = results[1] || [];
        _hideEl(playoffsLoading);
        if (!data || (!data.rounds && !data.bracket)) {
          _showEl(playoffsEmpty);
          return;
        }
        // Client-side team name resolution fallback
        if (teams.length > 0) {
          var teamMap = {};
          teams.forEach(function (t) { teamMap[t.id] = t.name; });
          var resolveGames = function (games) {
            (games || []).forEach(function (g) {
              if (!g.homeTeamName && g.homeTeamId) g.homeTeamName = teamMap[g.homeTeamId] || '';
              if (!g.awayTeamName && g.awayTeamId) g.awayTeamName = teamMap[g.awayTeamId] || '';
            });
          };
          if (data.rounds) {
            data.rounds.forEach(function (r) { resolveGames(r.games); });
          }
          if (data.bracket) {
            data.bracket.forEach(function (roundGames) { resolveGames(roundGames); });
          }
        }
        _renderPlayoffBracket(data);
        _showEl(playoffsBracketWrapper);
        _initBracketTouch();
      })
      .catch(function () {
        _hideEl(playoffsLoading);
        _showEl(playoffsEmpty);
      });
  }

  /**
   * Render playoff bracket as an elimination tree.
   * Data format expected:
   *   { rounds: [ { name: "首輪", games: [ { home, away, homeScore, awayScore, status } ] }, ... ] }
   * or
   *   { bracket: [ [game, game, ...], [game, ...], [game] ] }
   */
  function _renderPlayoffBracket(data) {
    if (!playoffsBracket) return;
    playoffsBracket.innerHTML = '';

    var rounds = data.rounds || [];
    // If bracket array format, convert to rounds
    if (!rounds.length && Array.isArray(data.bracket)) {
      var roundNames = [
        I18n.t('schedule.roundFirst') || '首輪',
        I18n.t('schedule.roundSemi') || '準決賽',
        I18n.t('schedule.roundFinal') || '決賽'
      ];
      rounds = data.bracket.map(function (games, i) {
        return { name: roundNames[i] || ('Round ' + (i + 1)), games: games || [] };
      });
    }

    if (!rounds.length) {
      _showEl(playoffsEmpty);
      _hideEl(playoffsBracketWrapper);
      return;
    }

    // Set CSS grid columns based on number of rounds
    playoffsBracket.style.gridTemplateColumns = 'repeat(' + rounds.length + ', minmax(200px, 1fr))';

    rounds.forEach(function (round, roundIdx) {
      var roundCol = document.createElement('div');
      roundCol.className = 'playoff-round';

      var roundTitle = document.createElement('h3');
      roundTitle.className = 'playoff-round-title';
      roundTitle.textContent = round.name || ('Round ' + (roundIdx + 1));
      roundCol.appendChild(roundTitle);

      var gamesContainer = document.createElement('div');
      gamesContainer.className = 'playoff-round-games';

      (round.games || []).forEach(function (game) {
        var matchup = _createPlayoffMatchup(game);
        gamesContainer.appendChild(matchup);
      });

      roundCol.appendChild(gamesContainer);
      playoffsBracket.appendChild(roundCol);
    });
  }

  function _createPlayoffMatchup(game) {
    var card = document.createElement('div');
    card.className = 'playoff-matchup';

    var homeName = game.homeTeamName || game.home || game.homeTeam || game.team1 || 'TBD';
    var awayName = game.awayTeamName || game.away || game.awayTeam || game.team2 || 'TBD';
    var homeScore = game.homeScore != null ? game.homeScore : '';
    var awayScore = game.awayScore != null ? game.awayScore : '';
    var isCompleted = game.status === 'completed' || (homeScore !== '' && awayScore !== '');

    var homeWin = isCompleted && Number(homeScore) > Number(awayScore);
    var awayWin = isCompleted && Number(awayScore) > Number(homeScore);

    card.innerHTML =
      '<div class="playoff-team' + (homeWin ? ' playoff-team--winner' : '') + '">' +
        '<span class="playoff-team-name">' + _escHtml(homeName) + '</span>' +
        '<span class="playoff-team-score">' + _escHtml(String(homeScore)) + '</span>' +
      '</div>' +
      '<div class="playoff-team' + (awayWin ? ' playoff-team--winner' : '') + '">' +
        '<span class="playoff-team-name">' + _escHtml(awayName) + '</span>' +
        '<span class="playoff-team-score">' + _escHtml(String(awayScore)) + '</span>' +
      '</div>';

    return card;
  }

  // --- 季後賽對陣表觸控支援（手機可縮放/滑動） ---
  function _initBracketTouch() {
    if (!playoffsBracketWrapper) return;

    var scale = 1;
    var originX = 0;
    var originY = 0;
    var startDist = 0;
    var startScale = 1;
    var isDragging = false;
    var startX = 0;
    var startY = 0;
    var translateX = 0;
    var translateY = 0;
    var startTranslateX = 0;
    var startTranslateY = 0;

    function _getTouchDist(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function _applyTransform() {
      if (!playoffsBracket) return;
      playoffsBracket.style.transform =
        'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
    }

    playoffsBracketWrapper.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        startDist = _getTouchDist(e.touches);
        startScale = scale;
      } else if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTranslateX = translateX;
        startTranslateY = translateY;
      }
    }, { passive: false });

    playoffsBracketWrapper.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var dist = _getTouchDist(e.touches);
        scale = Math.max(0.5, Math.min(3, startScale * (dist / startDist)));
        _applyTransform();
      } else if (e.touches.length === 1 && isDragging) {
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        translateX = startTranslateX + dx;
        translateY = startTranslateY + dy;
        _applyTransform();
      }
    }, { passive: false });

    playoffsBracketWrapper.addEventListener('touchend', function () {
      isDragging = false;
    });

    // Double-tap to reset
    var lastTap = 0;
    playoffsBracketWrapper.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTap < 300 && e.changedTouches.length === 1) {
        scale = 1;
        translateX = 0;
        translateY = 0;
        _applyTransform();
      }
      lastTap = now;
    });
  }

  // --- 工具函數 ---
  function _showEl(el) { if (el) el.style.display = ''; }
  function _hideEl(el) { if (el) el.style.display = 'none'; }

  function _escHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // --- 啟動 ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
