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
  function _loadSchedule() {
    if (!currentSeasonId) return;
    _showEl(scheduleLoading);
    _hideEl(scheduleEmpty);
    _hideEl(scheduleList);

    API.getSchedule(currentSeasonId)
      .then(function (games) {
        _hideEl(scheduleLoading);
        if (!games || games.length === 0) {
          _showEl(scheduleEmpty);
          return;
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
      var tr = document.createElement('tr');
      var homeName = game.homeTeamName || game.home || game.homeTeam || '—';
      var awayName = game.awayTeamName || game.away || game.awayTeam || '—';
      var matchup = homeName + ' vs ' + awayName;
      var result = '';

      if (game.result) {
        result = game.result;
      } else if (game.status === 'completed' && game.homeScore != null && game.awayScore != null) {
        result = game.homeScore + ' - ' + game.awayScore;
      } else {
        result = I18n.t('schedule.upcoming');
      }

      tr.innerHTML =
        '<td>' + _escHtml(Utils.formatDateWithDay(game.date)) + '</td>' +
        '<td>' + _escHtml(Utils.formatTime(game.time)) + '</td>' +
        '<td>' + _escHtml(game.venue || '—') + '</td>' +
        '<td>' + _escHtml(matchup) + '</td>' +
        '<td>' + _escHtml(result) + '</td>';

      scheduleTbody.appendChild(tr);
    });
  }

  // --- 載入季後賽對陣 ---
  function _loadPlayoffs() {
    if (!currentSeasonId) return;
    _showEl(playoffsLoading);
    _hideEl(playoffsEmpty);
    _hideEl(playoffsBracketWrapper);

    API.getPlayoffs(currentSeasonId)
      .then(function (data) {
        _hideEl(playoffsLoading);
        if (!data || (!data.rounds && !data.bracket)) {
          _showEl(playoffsEmpty);
          return;
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
