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
  var editNumbersButton = document.getElementById('btn-live-edit-numbers');
  var discardButton = document.getElementById('btn-live-discard');
  var saveDraftButton = document.getElementById('btn-live-save-draft');
  var reviewButton = document.getElementById('btn-live-review');
  var statusEl = document.getElementById('live-draft-status');
  var timeoutHalfEl = document.getElementById('live-timeout-half');
  var homeTeamFoulsEl = document.getElementById('live-home-team-fouls');
  var awayTeamFoulsEl = document.getElementById('live-away-team-fouls');
  var clockStrip = document.querySelector('.live-clock-strip');
  var clockDisplayEl = document.getElementById('live-clock-display');
  var clockStartButton = document.getElementById('btn-live-clock-start');
  var clockResetButton = document.getElementById('btn-live-clock-reset');
  var clockExportButton = document.getElementById('btn-live-clock-export');
  var clockHintEl = document.getElementById('live-clock-hint');
  var clockCountEl = document.getElementById('live-clock-count');
  var gameSelect = document.getElementById('game-select');
  var boxscoreBody = document.getElementById('boxscore-body');

  if (!panel || !gameSelect || !boxscoreBody) return;

  var activeQuarter = 1;
  var activePlayerIndex = null;
  var activeSide = 'home';
  var numberEditMode = false;
  var playerMap = {};
  var playerIndexById = {};
  var eventStack = [];
  var restoreAttemptedForGame = '';
  var timeouts = createDefaultTimeouts();
  var teamFoulsByQuarter = createDefaultTeamFouls();

  // --- 錄影計時 (highlight timestamp clock) ---
  var clockRunning = false;
  var clockElapsedMs = 0;         // 已累積的計時（暫停時為最終值）
  var clockResumeAtMs = 0;        // 最近一次開始/繼續的 wall time
  var clockFirstStartMs = 0;      // 錄影開始的 wall time（匯出用）
  var clockEntries = [];          // { elapsedMs, wallMs, quarter, side, player, event, score }
  var clockTimerId = null;
  var clockLoadedForGame = '';
  var clockHintTimerId = null;
  var CLOCK_HINT_DEFAULT = '與錄影同步按「開始」計時';

  function createDefaultTeamFouls() {
    return { home: { 1: 0, 2: 0, 3: 0, 4: 0 }, away: { 1: 0, 2: 0, 3: 0, 4: 0 } };
  }

  // ============================================================
  // 錄影計時：開始/暫停/重設、時間記錄與匯出
  // ============================================================
  function clockStorageKey() { return 'allin_hl_clock_v1_' + gameId(); }

  function clockElapsedNow() {
    return clockRunning ? clockElapsedMs + (Date.now() - clockResumeAtMs) : clockElapsedMs;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtElapsed(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return (h > 0 ? h + ':' + pad2(m) : String(m)) + ':' + pad2(s);
  }

  function fmtTimeOfDay(ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
  function fmtDateTime(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + fmtTimeOfDay(ms); }

  function updateClockDisplay() {
    if (clockDisplayEl) clockDisplayEl.textContent = fmtElapsed(clockElapsedNow());
  }

  function refreshClockStatus() {
    if (!clockStrip) return;
    clockStrip.classList.toggle('is-running', clockRunning);
    if (clockStartButton) {
      var started = clockFirstStartMs > 0 || clockElapsedMs > 0;
      clockStartButton.textContent = clockRunning ? '⏸ 暫停' : (started ? '▶ 繼續' : '▶ 開始');
      clockStartButton.classList.toggle('is-paused', !clockRunning && started);
    }
    if (clockResetButton) clockResetButton.hidden = !(clockFirstStartMs > 0 || clockElapsedMs > 0 || clockEntries.length > 0);
    if (clockCountEl) clockCountEl.textContent = '已記錄 ' + clockEntries.length + ' 球';
    if (clockExportButton) clockExportButton.disabled = clockEntries.length === 0;
  }

  function clockTick() {
    updateClockDisplay();
    refreshClockStatus();
  }

  function pauseClock() {
    if (!clockRunning) return;
    clockElapsedMs += Date.now() - clockResumeAtMs;
    clockRunning = false;
    if (clockTimerId !== null) { clearInterval(clockTimerId); clockTimerId = null; }
    clockTick();
  }

  function startPauseClock() {
    if (clockRunning) {
      pauseClock();
      setClockHint('計時已暫停' + (clockEntries.length ? ' · 已記錄 ' + clockEntries.length + ' 球' : ''));
      persistClockState();
    } else {
      if (!clockFirstStartMs) clockFirstStartMs = Date.now();
      clockResumeAtMs = Date.now();
      clockRunning = true;
      if (clockTimerId === null) clockTimerId = setInterval(clockTick, 250);
      setClockHint('計時中 · 每次 +2 / +3 命中會自動記錄時間');
      persistClockState();
    }
    clockTick();
  }

  function restartClockForQuarter() {
    var wasStarted = clockFirstStartMs > 0 || clockElapsedMs > 0;
    if (clockTimerId !== null) { clearInterval(clockTimerId); clockTimerId = null; }
    clockElapsedMs = 0;
    clockResumeAtMs = 0;
    if (wasStarted) {
      clockFirstStartMs = Date.now();
      clockRunning = true;
      clockResumeAtMs = Date.now();
      clockTimerId = setInterval(clockTick, 250);
      setClockHint('新一節開始，計時重新由 0 開始');
    } else {
      clockFirstStartMs = 0;
      clockRunning = false;
      setClockHint(CLOCK_HINT_DEFAULT);
    }
    persistClockState();
    clockTick();
  }

  function resetClock() {
    if (clockEntries.length && !confirm('重設錄影計時並清除已記錄的 ' + clockEntries.length + ' 球時間表？')) return;
    if (clockTimerId !== null) { clearInterval(clockTimerId); clockTimerId = null; }
    clockRunning = false;
    clockElapsedMs = 0;
    clockResumeAtMs = 0;
    clockFirstStartMs = 0;
    clockEntries = [];
    try { localStorage.removeItem(clockStorageKey()); } catch (error) { /* ignore */ }
    setClockHint(CLOCK_HINT_DEFAULT);
    clockTick();
  }

  function setClockHint(text, isWarning) {
    if (!clockHintEl) return;
    if (clockHintTimerId !== null) { clearTimeout(clockHintTimerId); clockHintTimerId = null; }
    clockHintEl.textContent = text;
    clockHintEl.classList.toggle('is-warning', !!isWarning);
  }

  function flashClockHint(text) {
    setClockHint(text, true);
    clockHintTimerId = setTimeout(function () {
      clockHintTimerId = null;
      if (clockRunning) setClockHint('計時中 · 每次 +2 / +3 命中會自動記錄時間');
      else setClockHint(CLOCK_HINT_DEFAULT);
    }, 3200);
  }

  function persistClockState() {
    if (!gameId()) return;
    try {
      localStorage.setItem(clockStorageKey(), JSON.stringify({
        elapsedMs: Math.round(clockElapsedNow()),
        wallStartMs: clockFirstStartMs,
        entries: clockEntries,
        savedAt: new Date().toISOString()
      }));
    } catch (error) { /* ignore */ }
  }

  function loadClockState() {
    if (clockLoadedForGame === gameId()) return;
    clockLoadedForGame = gameId();
    if (clockTimerId !== null) { clearInterval(clockTimerId); clockTimerId = null; }
    clockRunning = false;
    clockElapsedMs = 0;
    clockResumeAtMs = 0;
    clockFirstStartMs = 0;
    clockEntries = [];
    try {
      var raw = localStorage.getItem(clockStorageKey());
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved) {
          clockElapsedMs = Number.isFinite(Number(saved.elapsedMs)) ? Math.max(0, Number(saved.elapsedMs)) : 0;
          clockFirstStartMs = Number.isFinite(Number(saved.wallStartMs)) ? Number(saved.wallStartMs) : 0;
          if (Array.isArray(saved.entries)) clockEntries = saved.entries;
        }
      }
    } catch (error) { /* ignore */ }
    clockTick();
  }

  function recordHighlightEntry(label, side) {
    var home = 0, away = 0;
    [1, 2, 3, 4].forEach(function (quarter) {
      home += numberValue(quarterInput('home', quarter));
      away += numberValue(quarterInput('away', quarter));
    });
    clockEntries.push({
      elapsedMs: Math.round(clockElapsedNow()),
      wallMs: Date.now(),
      quarter: activeQuarter,
      side: side,
      player: playerMap[activePlayerIndex] ? playerMap[activePlayerIndex].label : '',
      event: label,
      score: home + '-' + away
    });
    persistClockState();
    refreshClockStatus();
    return true;
  }

  function exportHighlightLog() {
    if (!clockEntries.length) return;
    var homeName = document.getElementById('qs-home-label');
    var awayName = document.getElementById('qs-away-label');
    homeName = homeName ? homeName.textContent.trim() || '主隊' : '主隊';
    awayName = awayName ? awayName.textContent.trim() || '客隊' : '客隊';
    var gameLabel = gameSelect.options[gameSelect.selectedIndex] ? gameSelect.options[gameSelect.selectedIndex].textContent : '';

    var lines = [];
    lines.push(['ALL-IN Basketball League — Highlight Timestamps']);
    lines.push(['比賽', gameLabel]);
    lines.push(['對賽', homeName + ' vs ' + awayName]);
    lines.push(['錄影開始時間', clockFirstStartMs ? fmtDateTime(clockFirstStartMs) : '—', '共記錄 ' + clockEntries.length + ' 球']);
    lines.push([]);
    lines.push(['序號', '影片時間(MM:SS)', '實際時間(HH:MM:SS)', '節', '隊伍', '球員', '事件', '比分']);
    clockEntries.forEach(function (entry, i) {
      lines.push([
        i + 1,
        fmtElapsed(entry.elapsedMs),
        entry.wallMs ? fmtTimeOfDay(entry.wallMs) : '',
        'Q' + entry.quarter,
        entry.side === 'away' ? awayName : homeName,
        entry.player,
        entry.event,
        entry.score
      ]);
    });

    var csv = '\uFEFF' + lines.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell == null ? '' : cell);
        if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(',');
    }).join('\r\n');

    var safe = function (name) { return String(name || 'team').replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, ''); };
    var filename = 'highlight-times-' + safe(homeName) + '-vs-' + safe(awayName) + '.csv';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    setClockHint('已匯出 ' + filename);
  }

  function restoreTeamFouls(savedTeamFouls) {
    teamFoulsByQuarter = createDefaultTeamFouls();
    ['home', 'away'].forEach(function (side) {
      [1, 2, 3, 4].forEach(function (quarter) {
        var value = savedTeamFouls && savedTeamFouls[side] ? Number(savedTeamFouls[side][quarter]) : 0;
        teamFoulsByQuarter[side][quarter] = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
      });
    });
  }

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
      button.textContent = used ? '×' : '□';
      button.classList.toggle('is-used', used);
      button.setAttribute('aria-pressed', used ? 'true' : 'false');
      button.setAttribute('aria-label', (side === 'home' ? '主隊' : '客隊') + '第 ' + (slot + 1) + ' 次暫停' + (used ? '已記錄，點按清除' : '，點按記錄'));
    });
  }

  function toggleTimeoutSlot(side, slot) {
    var half = currentTimeoutHalf();
    if ((side !== 'home' && side !== 'away') || slot < 0 || slot >= timeoutLimit(half)) return;
    var wasUsed = timeouts[half][side][slot];
    timeouts[half][side][slot] = !wasUsed;
    if (!wasUsed && clockRunning) {
      // 記錄暫停時自動停錶，方便同步錄影剪片
      pauseClock();
      setClockHint('已記錄暫停，計時自動暫停');
      persistClockState();
    }
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
    loadClockState();
    refreshDisplay();
  }

  function jerseySortValue(player) {
    var match = String(player.label || '').match(/#\s*(\d+)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  function renderRoster() {
    homePlayersEl.innerHTML = '';
    awayPlayersEl.innerHTML = '';
    Object.keys(playerMap).sort(function (left, right) {
      var leftPlayer = playerMap[left], rightPlayer = playerMap[right];
      var leftNumber = jerseySortValue(leftPlayer), rightNumber = jerseySortValue(rightPlayer);
      return leftNumber - rightNumber || String(leftPlayer.label).localeCompare(String(rightPlayer.label));
    }).forEach(function (index) {
      var player = playerMap[index];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'live-player-tile';
      button.dataset.playerIndex = index;
      button.innerHTML = '<strong class="live-player-number">' + escapeHtml(player.label.split(' ')[0]) + '</strong><span class="live-player-points live-player-fouls" title="個人犯規" aria-label="個人犯規"><small>F</small><strong id="live-player-fouls-' + index + '">0</strong></span>';
      button.addEventListener('click', function () {
        if (numberEditMode) changePlayerNumber(index);
        else selectPlayer(index);
      });
      (player.side === 'home' ? homePlayersEl : awayPlayersEl).appendChild(button);
    });
    homePlayersEl.appendChild(createSpareTile('home'));
    awayPlayersEl.appendChild(createSpareTile('away'));
    updateRosterDensity();
    if (activePlayerIndex !== null && playerMap[activePlayerIndex]) selectPlayer(activePlayerIndex);
  }

  function createSpareTile(side) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'live-player-tile live-player-tile--add';
    button.setAttribute('aria-label', (side === 'home' ? '主隊' : '客隊') + '加入上陣球員');
    button.textContent = '＋';
    button.addEventListener('click', function () { addSpareNumber(side); });
    return button;
  }

  function addSpareNumber(side) {
    document.dispatchEvent(new CustomEvent('allin:boxscoreShowSparePicker', {
      detail: { gameId: gameId(), side: side }
    }));
  }

  function changePlayerNumber(index) {
    var player = playerMap[index];
    if (!player) return;
    var currentNumber = String(player.label || '').split(' ')[0].replace('#', '');
    var number = window.prompt('更改本場球衣號碼（球員檔案不變）：', currentNumber);
    if (number === null) return;
    number = String(number).trim();
    if (!/^\d{1,3}$/.test(number)) {
      selectedLabel.hidden = false;
      selectedLabel.textContent = '請輸入 0–999 的球衣號碼';
      selectedLabel.classList.add('is-warning');
      return;
    }
    document.dispatchEvent(new CustomEvent('allin:boxscoreJerseyNumberChanged', {
      detail: { gameId: gameId(), playerIndex: String(index), number: number }
    }));
  }

  function setNumberEditMode(enabled) {
    numberEditMode = !!enabled;
    if (editNumbersButton) {
      editNumbersButton.classList.toggle('is-active', numberEditMode);
      editNumbersButton.setAttribute('aria-pressed', numberEditMode ? 'true' : 'false');
    }
    selectedLabel.hidden = false;
    selectedLabel.classList.toggle('is-warning', numberEditMode);
    selectedLabel.textContent = numberEditMode ? '更改號碼：請點選球衣按鈕' : '先點選球員，再記錄事件';
    document.body.classList.toggle('live-edit-numbers', numberEditMode);
  }

  function updateRosterDensity() {
    var largestTeam = Math.max(
      homePlayersEl.querySelectorAll('.live-player-tile:not(.live-player-tile--add)').length,
      awayPlayersEl.querySelectorAll('.live-player-tile:not(.live-player-tile--add)').length
    );
    panel.classList.remove('live-entry-panel--dense', 'live-entry-panel--extra-dense');
    if (largestTeam > 12) panel.classList.add('live-entry-panel--extra-dense');
    else if (largestTeam > 8) panel.classList.add('live-entry-panel--dense');
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

  function applyEvent(label, deltas, scoreDelta, highlightEligible) {
    if (activePlayerIndex === null || !playerMap[activePlayerIndex]) {
      selectedLabel.textContent = '請先點選球員';
      selectedLabel.classList.add('is-warning');
      return false;
    }
    selectedLabel.classList.remove('is-warning');
    var before = {};
    Object.keys(deltas).forEach(function (field) { before[field] = numberValue(statInput(activePlayerIndex, field)); });
    var quarterBefore = numberValue(quarterInput(activeSide, activeQuarter));
    var teamFoulsBefore = teamFoulsByQuarter[activeSide][activeQuarter];
    Object.keys(deltas).forEach(function (field) { setNumber(activePlayerIndex, field, before[field] + deltas[field]); });
    if (deltas.fouls) teamFoulsByQuarter[activeSide][activeQuarter] = Math.max(0, teamFoulsBefore + deltas.fouls);
    if (scoreDelta) changeQuarterScore(activeSide, scoreDelta);
    var event = { playerIndex: activePlayerIndex, side: activeSide, quarter: activeQuarter, label: label, before: before, quarterBefore: quarterBefore, teamFoulsBefore: teamFoulsBefore, highlightLogged: false };
    if (highlightEligible) {
      if (clockRunning) {
        event.highlightLogged = recordHighlightEntry(label, activeSide);
      } else {
        flashClockHint('未開始計時：此球未有記錄時間（請按「▶ 開始」）');
      }
    }
    eventStack.push(event);
    persistDraft();
    refreshDisplay();
    return true;
  }

  function undoLast() {
    var event = eventStack.pop();
    if (!event) return;
    Object.keys(event.before).forEach(function (field) { setNumber(event.playerIndex, field, event.before[field]); });
    setQuarterScore(event.side, event.quarter, event.quarterBefore);
    if (event.teamFoulsBefore !== undefined) teamFoulsByQuarter[event.side][event.quarter] = event.teamFoulsBefore;
    if (event.highlightLogged && clockEntries.length) {
      clockEntries.pop();
      persistClockState();
      refreshClockStatus();
    }
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
      var fouls = numberValue(statInput(index, 'fouls'));
      var foulsEl = document.getElementById('live-player-fouls-' + index);
      if (foulsEl) foulsEl.textContent = fouls;
    });
    if (homeTeamFoulsEl) homeTeamFoulsEl.textContent = teamFoulsByQuarter.home[activeQuarter];
    if (awayTeamFoulsEl) awayTeamFoulsEl.textContent = teamFoulsByQuarter.away[activeQuarter];
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
      version: 5,
      savedAt: new Date().toISOString(),
      stats: stats,
      quarters: quarters,
      teamFoulsByQuarter: { home: Object.assign({}, teamFoulsByQuarter.home), away: Object.assign({}, teamFoulsByQuarter.away) },
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
      if ((draft.version !== 2 && draft.version !== 3 && draft.version !== 4 && draft.version !== 5) || !draft.stats) {
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
      restoreTeamFouls(draft.teamFoulsByQuarter);
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
      var quarter = Number(button.dataset.liveQuarter);
      var quarterChanged = quarter !== activeQuarter;
      activeQuarter = quarter;
      if (quarterChanged) restartClockForQuarter();
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
      if (actions[type]) applyEvent(actions[type][0], actions[type][1], actions[type][2], type === '2m' || type === '3m');
    });
  });

  undoButton.addEventListener('click', undoLast);
  if (clockStartButton) clockStartButton.addEventListener('click', startPauseClock);
  if (clockResetButton) clockResetButton.addEventListener('click', resetClock);
  if (clockExportButton) clockExportButton.addEventListener('click', exportHighlightLog);

  window.addEventListener('pagehide', function () {
    if (clockRunning) {
      clockElapsedMs += Date.now() - clockResumeAtMs;
      clockResumeAtMs = Date.now();
      persistClockState();
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && clockRunning) {
      clockElapsedMs += Date.now() - clockResumeAtMs;
      clockResumeAtMs = Date.now();
      persistClockState();
    }
  });
  if (editNumbersButton) editNumbersButton.addEventListener('click', function () {
    setNumberEditMode(!numberEditMode);
  });
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
    teamFoulsByQuarter = createDefaultTeamFouls();
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
    if (clockRunning) {
      clockElapsedMs += Date.now() - clockResumeAtMs;
      clockRunning = false;
      if (clockTimerId !== null) { clearInterval(clockTimerId); clockTimerId = null; }
      clockTick();
    }
    try { localStorage.removeItem(draftKey()); } catch (error) { /* ignore */ }
    eventStack = [];
    timeouts = createDefaultTimeouts();
    teamFoulsByQuarter = createDefaultTeamFouls();
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
    setNumberEditMode(false);
    timeouts = createDefaultTimeouts();
    teamFoulsByQuarter = createDefaultTeamFouls();
    restoreAttemptedForGame = '';
    clockLoadedForGame = '';
    loadClockState();
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
// Live foul indicators build: 20261015-foul-totals-v2
