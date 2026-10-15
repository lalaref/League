(function () {
  'use strict';

  var panel = document.getElementById('live-entry-panel');
  var homePlayersEl = document.getElementById('live-home-players');
  var awayPlayersEl = document.getElementById('live-away-players');
  var homeScoreEl = document.getElementById('live-home-score');
  var awayScoreEl = document.getElementById('live-away-score');
  var quarterLabel = document.getElementById('live-quarter-label');
  var selectedLabel = document.getElementById('live-selected-player');
  var undoButton = document.getElementById('btn-live-undo');
  var discardButton = document.getElementById('btn-live-discard');
  var saveDraftButton = document.getElementById('btn-live-save-draft');
  var reviewButton = document.getElementById('btn-live-review');
  var statusEl = document.getElementById('live-draft-status');
  var timeoutHalfEl = document.getElementById('live-timeout-half');
  var gameSelect = document.getElementById('game-select');
  var boxscoreBody = document.getElementById('boxscore-body');

  if (!panel || !gameSelect || !boxscoreBody) return;

  var activeQuarter = 1;
  var activePlayerIndex = null;
  var activeSide = 'home';
  var playerMap = {};
  var playerIndexById = {};
  var eventStack = [];
  var restoreAttemptedForGame = '';
  var timeouts = createDefaultTimeouts();

  function createDefaultTimeouts() {
    return {
      first: { home: [false, false], away: [false, false] },
      second: { home: [false, false, false], away: [false, false, false] }
    };
  }

  function currentTimeoutHalf() { return activeQuarter <= 2 ? 'first' : 'second'; }
  function timeoutLimit(half) { return half === 'first' ? 2 : 3; }

  function restoreTimeouts(savedTimeouts) {
    timeouts = createDefaultTimeouts();
    ['first', 'second'].forEach(function (half) {
      ['home', 'away'].forEach(function (side) {
        var saved = savedTimeouts && savedTimeouts[half] ? savedTimeouts[half][side] : null;
        if (Array.isArray(saved)) {
          timeouts[half][side] = timeouts[half][side].map(function (_, slot) { return !!saved[slot]; });
        } else if (Number.isFinite(Number(saved))) {
          // Version 3 drafts stored remaining counts, so mark the matching
          // number of leftmost FIBA score-sheet boxes when restoring them.
          var usedCount = timeoutLimit(half) - Math.max(0, Math.min(timeoutLimit(half), Math.round(Number(saved))));
          timeouts[half][side] = timeouts[half][side].map(function (_, slot) { return slot < usedCount; });
        }
      });
    });
  }

  function refreshTimeoutDisplay() {
    var half = currentTimeoutHalf();
    var limit = timeoutLimit(half);
    if (timeoutHalfEl) timeoutHalfEl.textContent = half === 'first' ? '上半場：每隊 2 次' : '下半場：每隊 3 次';
    document.querySelectorAll('[data-timeout-side][data-timeout-slot]').forEach(function (button) {
      var side = button.dataset.timeoutSide;
      var slot = Number(button.dataset.timeoutSlot);
      if (side !== 'home' && side !== 'away') return;
      var available = slot >= 0 && slot < limit;
      button.hidden = !available;
      if (!available) return;
      var used = !!timeouts[half][side][slot];
      button.textContent = used ? '×' : '';
      button.classList.toggle('is-used', used);
      button.setAttribute('aria-pressed', used ? 'true' : 'false');
      button.setAttribute('aria-label', (side === 'home' ? '主隊' : '客隊') + '第 ' + (slot + 1) + ' 次暫停' + (used ? '已記錄，點按清除' : '，點按記錄'));
    });
  }

  function toggleTimeoutSlot(side, slot) {
    var half = currentTimeoutHalf();
    if ((side !== 'home' && side !== 'away') || slot < 0 || slot >= timeoutLimit(half)) return;
    timeouts[half][side][slot] = !timeouts[half][side][slot];
    persistDraft();
    refreshTimeoutDisplay();
  }

  function syncQuarterButtons() {
    document.querySelectorAll('[data-live-quarter]').forEach(function (button) {
      button.classList.toggle('is-active', Number(button.dataset.liveQuarter) === activeQuarter);
    });
  }

  function gameId() { return String(gameSelect.value || ''); }
  function draftKey() { return 'allin_live_boxscore_v1_' + gameId(); }
  function statInput(index, field) { return document.getElementById('stat-' + index + '-' + field); }
  function mobileStatInput(index, field) { return document.getElementById('mob-' + index + '-' + field); }

  function numberValue(el) { return el ? (parseInt(el.value, 10) || 0) : 0; }
  function setNumber(index, field, value) {
    value = Math.max(0, value);
    [statInput(index, field), mobileStatInput(index, field)].forEach(function (input) {
      if (!input) return;
      input.value = value || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function quarterInput(side, quarter) { return document.getElementById('qs-' + side + 'Q' + quarter); }
  function setQuarterScore(side, quarter, value) {
    var input = quarterInput(side, quarter);
    if (!input) return;
    input.value = Math.max(0, value) || '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function changeQuarterScore(side, delta) {
    var input = quarterInput(side, activeQuarter);
    setQuarterScore(side, activeQuarter, numberValue(input) + delta);
  }

  function buildPlayers() {
    var rows = boxscoreBody.querySelectorAll('tr[data-player-index]');
    if (!rows.length || !gameId()) {
      panel.hidden = true;
      return;
    }
    playerMap = {};
    playerIndexById = {};
    rows.forEach(function (row) {
      var index = String(row.dataset.playerIndex);
      var name = row.querySelector('.admin-player-name');
      var firstInput = row.querySelector('.admin-stat-input');
      if (!firstInput) return;
      var player = {
        id: String(row.dataset.playerId || ''),
        index: index,
        label: name ? name.textContent.trim() : ('球員 ' + index),
        side: row.querySelector('#stat-' + index + '-pts') && row.querySelector('#stat-' + index + '-pts').closest('tr').previousElementSibling ? '' : '',
        teamId: ''
      };
      // Team headers are rendered immediately before each player block.
      var sibling = row.previousElementSibling;
      while (sibling && !sibling.classList.contains('admin-team-header-row')) sibling = sibling.previousElementSibling;
      player.side = sibling && /主隊|Home/i.test(sibling.textContent) ? 'home' : 'away';
      playerMap[index] = player;
      if (player.id) playerIndexById[player.id] = index;
    });

    // Header wording can be localised; establish the true sides from input team totals.
    var ordered = Object.keys(playerMap).map(function (key) { return playerMap[key]; });
    var homeCount = Math.ceil(ordered.length / 2);
    ordered.forEach(function (player, ordinal) {
      if (player.side !== 'home' && player.side !== 'away') player.side = ordinal < homeCount ? 'home' : 'away';
    });

    renderRoster();
    var homeName = document.getElementById('qs-home-label');
    var awayName = document.getElementById('qs-away-label');
    var liveHomeName = document.getElementById('qs-live-home-name');
    var liveAwayName = document.getElementById('qs-live-away-name');
    if (liveHomeName && homeName) liveHomeName.textContent = homeName.textContent || '主隊';
    if (liveAwayName && awayName) liveAwayName.textContent = awayName.textContent || '客隊';
    panel.hidden = false;
    if (new URLSearchParams(window.location.search).get('timekeeper') === '1') document.body.classList.add('live-entry-active');
    restoreDraft();
    refreshDisplay();
  }

  function renderRoster() {
    homePlayersEl.innerHTML = '';
    awayPlayersEl.innerHTML = '';
    Object.keys(playerMap).forEach(function (index) {
      var player = playerMap[index];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'live-player-tile';
      button.dataset.playerIndex = index;
      button.innerHTML = '<strong class="live-player-number">' + escapeHtml(player.label.split(' ')[0]) + '</strong><strong class="live-player-points" id="live-player-pts-' + index + '">0</strong>';
      button.addEventListener('click', function () { selectPlayer(index); });
      (player.side === 'home' ? homePlayersEl : awayPlayersEl).appendChild(button);
    });
    updateRosterDensity();
  }

  function updateRosterDensity() {
    var largestTeam = Math.max(homePlayersEl.children.length, awayPlayersEl.children.length);
    panel.classList.remove('live-entry-panel--dense', 'live-entry-panel--extra-dense');
    if (largestTeam > 10) panel.classList.add('live-entry-panel--extra-dense');
    else if (largestTeam > 5) panel.classList.add('live-entry-panel--dense');
  }

  function selectPlayer(index) {
    activePlayerIndex = String(index);
    activeSide = playerMap[activePlayerIndex].side;
    document.querySelectorAll('.live-player-tile').forEach(function (button) {
      button.classList.toggle('is-selected', button.dataset.playerIndex === activePlayerIndex);
    });
    selectedLabel.textContent = '已選：' + playerMap[activePlayerIndex].label.split(' ')[0];
    refreshDisplay();
  }

  function applyEvent(label, deltas, scoreDelta) {
    if (activePlayerIndex === null || !playerMap[activePlayerIndex]) {
      selectedLabel.textContent = '請先點選球員';
      selectedLabel.classList.add('is-warning');
      return;
    }
    selectedLabel.classList.remove('is-warning');
    var before = {};
    Object.keys(deltas).forEach(function (field) { before[field] = numberValue(statInput(activePlayerIndex, field)); });
    var quarterBefore = numberValue(quarterInput(activeSide, activeQuarter));
    Object.keys(deltas).forEach(function (field) { setNumber(activePlayerIndex, field, before[field] + deltas[field]); });
    if (scoreDelta) changeQuarterScore(activeSide, scoreDelta);
    eventStack.push({ playerIndex: activePlayerIndex, side: activeSide, quarter: activeQuarter, label: label, before: before, quarterBefore: quarterBefore });
    persistDraft();
    refreshDisplay();
  }

  function undoLast() {
    var event = eventStack.pop();
    if (!event) return;
    Object.keys(event.before).forEach(function (field) { setNumber(event.playerIndex, field, event.before[field]); });
    setQuarterScore(event.side, event.quarter, event.quarterBefore);
    activePlayerIndex = event.playerIndex;
    activeSide = event.side;
    persistDraft();
    refreshDisplay();
  }

  function refreshDisplay() {
    var homeScore = 0, awayScore = 0;
    [1, 2, 3, 4].forEach(function (quarter) {
      homeScore += numberValue(quarterInput('home', quarter));
      awayScore += numberValue(quarterInput('away', quarter));
    });
    homeScoreEl.textContent = homeScore;
    awayScoreEl.textContent = awayScore;
    quarterLabel.textContent = 'Q' + activeQuarter;
    undoButton.disabled = eventStack.length === 0;
    Object.keys(playerMap).forEach(function (index) {
      var points = numberValue(statInput(index, 'pts'));
      var pointsEl = document.getElementById('live-player-pts-' + index);
      if (pointsEl) pointsEl.textContent = points;
    });
    refreshTimeoutDisplay();
  }

  function snapshot() {
    var stats = {};
    Object.keys(playerMap).forEach(function (index) {
      var player = playerMap[index];
      if (!player.id) return;
      stats[player.id] = {};
      ['pts','fgm','fga','tpm','tpa','ftm','fta','oreb','dreb','ast','stl','blk','to','fouls'].forEach(function (field) {
        stats[player.id][field] = numberValue(statInput(index, field));
      });
    });
    var quarters = {};
    ['home', 'away'].forEach(function (side) {
      [1, 2, 3, 4].forEach(function (quarter) { quarters[side + 'Q' + quarter] = numberValue(quarterInput(side, quarter)); });
    });
    return {
      version: 4,
      savedAt: new Date().toISOString(),
      stats: stats,
      quarters: quarters,
      timeouts: {
        first: { home: timeouts.first.home.slice(), away: timeouts.first.away.slice() },
        second: { home: timeouts.second.home.slice(), away: timeouts.second.away.slice() }
      },
      activeQuarter: activeQuarter,
      activePlayerId: activePlayerIndex !== null && playerMap[activePlayerIndex] ? playerMap[activePlayerIndex].id : ''
    };
  }

  function persistDraft() {
    if (!gameId()) return;
    try {
      localStorage.setItem(draftKey(), JSON.stringify(snapshot()));
      statusEl.textContent = '草稿已儲存在此裝置 · ' + new Date().toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
    } catch (error) { statusEl.textContent = '此裝置無法儲存草稿'; }
  }

  function restoreDraft() {
    if (restoreAttemptedForGame === gameId()) return;
    restoreAttemptedForGame = gameId();
    try {
      var raw = localStorage.getItem(draftKey());
      if (!raw) { statusEl.textContent = '未儲存到伺服器；提交前資料只保存在此裝置'; return; }
      var draft = JSON.parse(raw);
      if (draft.submissionUncertain) {
        statusEl.textContent = '上次提交可能已成功。請先重新載入並核對伺服器資料，暫不自動還原草稿。';
        return;
      }
      if ((draft.version !== 2 && draft.version !== 3 && draft.version !== 4) || !draft.stats) {
        statusEl.textContent = '發現舊版草稿，為保護球員資料不會自動還原';
        return;
      }
      if (!confirm('發現此場比賽的本機即時記錄草稿（' + (draft.savedAt || '') + '）。要還原嗎？')) return;
      Object.keys(draft.stats).forEach(function (playerId) {
        var index = playerIndexById[playerId];
        if (index === undefined) return;
        Object.keys(draft.stats[playerId]).forEach(function (field) { setNumber(index, field, draft.stats[playerId][field]); });
      });
      Object.keys(draft.quarters || {}).forEach(function (key) {
        var match = key.match(/^(home|away)Q([1-4])$/);
        if (match) setQuarterScore(match[1], Number(match[2]), draft.quarters[key]);
      });
      restoreTimeouts(draft.timeouts);
      // Event history uses transient row positions, so a restored draft begins
      // with correct player totals but intentionally starts a fresh undo stack.
      eventStack = [];
      activeQuarter = Math.max(1, Math.min(4, Number(draft.activeQuarter) || 1));
      activePlayerIndex = draft.activePlayerId && playerIndexById[draft.activePlayerId] !== undefined ? playerIndexById[draft.activePlayerId] : null;
      syncQuarterButtons();
      if (activePlayerIndex !== null) selectPlayer(activePlayerIndex);
      statusEl.textContent = '已還原此裝置的即時記錄草稿';
    } catch (error) { statusEl.textContent = '草稿無法還原'; }
  }

  function discardDraft() {
    if (!gameId() || !confirm('清除這台平板的即時記錄草稿？目前畫面上的資料不會被刪除。')) return;
    localStorage.removeItem(draftKey());
    eventStack = [];
    statusEl.textContent = '本機草稿已清除';
    refreshDisplay();
  }

  document.querySelectorAll('[data-live-quarter]').forEach(function (button) {
    button.addEventListener('click', function () {
      activeQuarter = Number(button.dataset.liveQuarter);
      syncQuarterButtons();
      persistDraft();
      refreshDisplay();
    });
  });

  document.querySelectorAll('[data-timeout-side][data-timeout-slot]').forEach(function (button) {
    button.addEventListener('click', function () {
      toggleTimeoutSlot(button.dataset.timeoutSide, Number(button.dataset.timeoutSlot));
    });
  });

  document.querySelectorAll('[data-live-event]').forEach(function (button) {
    button.addEventListener('click', function () {
      var type = button.dataset.liveEvent;
      var actions = {
        '2m': ['兩分命中', { pts: 2, fgm: 1, fga: 1 }, 2],
        '2x': ['兩分不中', { fga: 1 }, 0],
        '3m': ['三分命中', { pts: 3, fgm: 1, fga: 1, tpm: 1, tpa: 1 }, 3],
        '3x': ['三分不中', { fga: 1, tpa: 1 }, 0],
        'ftm': ['罰球命中', { pts: 1, ftm: 1, fta: 1 }, 1],
        'ftx': ['罰球不中', { fta: 1 }, 0],
        'oreb': ['進攻籃板', { oreb: 1 }, 0],
        'dreb': ['防守籃板', { dreb: 1 }, 0],
        'ast': ['助攻', { ast: 1 }, 0],
        'stl': ['抄截', { stl: 1 }, 0],
        'blk': ['封阻', { blk: 1 }, 0],
        'to': ['失誤', { to: 1 }, 0],
        'foul': ['犯規', { fouls: 1 }, 0]
      };
      if (actions[type]) applyEvent(actions[type][0], actions[type][1], actions[type][2]);
    });
  });

  undoButton.addEventListener('click', undoLast);
  discardButton.addEventListener('click', discardDraft);
  if (saveDraftButton) saveDraftButton.addEventListener('click', function () {
    persistDraft();
    saveDraftButton.textContent = '✓ 草稿已儲存';
    window.setTimeout(function () { saveDraftButton.textContent = '💾 儲存本機草稿'; }, 1400);
  });
  if (reviewButton) reviewButton.addEventListener('click', function () {
    persistDraft();
    document.body.classList.remove('live-entry-active');
    document.getElementById('quarter-scores-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.addEventListener('allin:boxscoreRosterChanged', function (event) {
    if (!event.detail || String(event.detail.gameId || '') !== gameId()) return;
    try { localStorage.removeItem(draftKey()); } catch (error) { /* ignore */ }
    eventStack = [];
    activePlayerIndex = null;
    timeouts = createDefaultTimeouts();
    restoreAttemptedForGame = gameId();
    statusEl.textContent = '球員名單已變更；目前統計已保留，本機 Undo／還原草稿已重設';
    refreshDisplay();
  });

  document.addEventListener('allin:boxscoreSubmissionUncertain', function (event) {
    if (!event.detail || String(event.detail.gameId || '') !== gameId()) return;
    try {
      var draft = JSON.parse(localStorage.getItem(draftKey()) || '{}');
      draft.submissionUncertain = true;
      localStorage.setItem(draftKey(), JSON.stringify(draft));
    } catch (error) { /* ignore */ }
    statusEl.textContent = '提交逾時：草稿已保留，但下次請先核對伺服器結果';
  });

  document.addEventListener('allin:boxscoreSaved', function (event) {
    if (!event.detail || String(event.detail.gameId || '') !== gameId()) return;
    try { localStorage.removeItem(draftKey()); } catch (error) { /* ignore */ }
    eventStack = [];
    timeouts = createDefaultTimeouts();
    restoreAttemptedForGame = gameId();
    statusEl.textContent = 'Box Score 已提交；本機即時草稿已清除';
    refreshDisplay();
  });

  var observer = new MutationObserver(function () { window.setTimeout(buildPlayers, 0); });
  observer.observe(boxscoreBody, { childList: true, subtree: true });
  gameSelect.addEventListener('change', function () {
    activeQuarter = 1;
    activePlayerIndex = null;
    eventStack = [];
    timeouts = createDefaultTimeouts();
    restoreAttemptedForGame = '';
    panel.hidden = true;
    document.body.classList.remove('live-entry-active');
    syncQuarterButtons();
    refreshTimeoutDisplay();
  });

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }
})();
