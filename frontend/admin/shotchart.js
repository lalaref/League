/**
 * ALL-IN Basketball League — 投籃位置記錄介面
 * 需求：9.1
 */
(function () {
  'use strict';

  var seasonSelect = document.getElementById('season-select');
  var gameSelect = document.getElementById('game-select');
  var playerSelect = document.getElementById('player-select');
  var messageEl = document.getElementById('shotchart-message');
  var courtContainer = document.getElementById('court-container');
  var courtSvg = document.getElementById('court-svg');
  var shotMarkers = document.getElementById('shot-markers');
  var shotToggle = document.getElementById('shot-result-toggle');
  var tapHint = document.getElementById('tap-hint');
  var shotStats = document.getElementById('shot-stats');
  var shotActions = document.getElementById('shot-actions');
  var btnMade = document.getElementById('btn-shot-made');
  var btnMissed = document.getElementById('btn-shot-missed');
  var btnUndo = document.getElementById('btn-undo');
  var btnClear = document.getElementById('btn-clear');

  var statTotal = document.getElementById('stat-total');
  var statMade = document.getElementById('stat-made');
  var statMissed = document.getElementById('stat-missed');
  var statPct = document.getElementById('stat-pct');

  var shotResult = true; // true = made, false = missed
  var shots = []; // [{x, y, made, id}]
  var allPlayers = [];

  loadSeasons();
  seasonSelect.addEventListener('change', function () { loadGames(seasonSelect.value); });
  gameSelect.addEventListener('change', function () { if (gameSelect.value) loadPlayers(gameSelect.value); else disablePlayer(); });
  playerSelect.addEventListener('change', function () { if (playerSelect.value) enableCourt(); else disableCourt(); });
  btnMade.addEventListener('click', function () { setShotResult(true); });
  btnMissed.addEventListener('click', function () { setShotResult(false); });
  btnUndo.addEventListener('click', undoLast);
  btnClear.addEventListener('click', clearAll);
  courtSvg.addEventListener('click', handleCourtClick);

  function loadSeasons() {
    API.getSeasons().then(function (seasons) {
      seasonSelect.innerHTML = '<option value="">--</option>';
      (seasons || []).forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.name;
        seasonSelect.appendChild(o);
      });
    }).catch(function () { showMsg(I18n.t('error.loadFailed'), 'error'); });
  }

  function loadGames(seasonId) {
    if (!seasonId) { gameSelect.innerHTML = '<option value="">--</option>'; gameSelect.disabled = true; disablePlayer(); return; }
    API.getGames(seasonId).then(function (games) {
      gameSelect.innerHTML = '<option value="">--</option>';
      gameSelect.disabled = false;
      (games || []).forEach(function (g) {
        var o = document.createElement('option');
        o.value = g.id;
        o.textContent = g.date + ' — ' + (g.homeTeamName || g.homeTeamId) + ' vs ' + (g.awayTeamName || g.awayTeamId);
        gameSelect.appendChild(o);
      });
    }).catch(function () { showMsg(I18n.t('error.loadFailed'), 'error'); });
  }

  function loadPlayers(gameId) {
    API.getGames(seasonSelect.value).then(function (games) {
      var game = (games || []).find(function (g) { return g.id === gameId; });
      if (!game) return;
      return Promise.all([API.getPlayers(game.homeTeamId), API.getPlayers(game.awayTeamId)]);
    }).then(function (results) {
      if (!results) return;
      allPlayers = (results[0] || []).concat(results[1] || []);
      playerSelect.innerHTML = '<option value="">--</option>';
      playerSelect.disabled = false;
      allPlayers.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.id;
        o.textContent = '#' + (p.number || '?') + ' ' + p.name;
        playerSelect.appendChild(o);
      });
    }).catch(function () { showMsg(I18n.t('error.loadFailed'), 'error'); });
  }

  function disablePlayer() {
    playerSelect.innerHTML = '<option value="">--</option>';
    playerSelect.disabled = true;
    disableCourt();
  }

  function enableCourt() {
    courtContainer.hidden = false;
    shotToggle.hidden = false;
    tapHint.hidden = false;
    shotStats.hidden = false;
    shotActions.hidden = false;
    shots = [];
    renderShots();
    // Load existing shots for this player+game
    API.getShotChart(playerSelect.value, gameSelect.value).then(function (existing) {
      if (existing && existing.length) {
        shots = existing.map(function (s) { return { x: s.x, y: s.y, made: s.made, id: s.id }; });
        renderShots();
      }
    }).catch(function () { /* no existing data */ });
  }

  function disableCourt() {
    courtContainer.hidden = true;
    shotToggle.hidden = true;
    tapHint.hidden = true;
    shotStats.hidden = true;
    shotActions.hidden = true;
  }

  function setShotResult(made) {
    shotResult = made;
    btnMade.classList.toggle('active', made);
    btnMissed.classList.toggle('active', !made);
    btnMade.className = made ? 'btn btn-primary admin-shot-btn active' : 'btn btn-outline admin-shot-btn';
    btnMissed.className = !made ? 'btn btn-primary admin-shot-btn active' : 'btn btn-outline admin-shot-btn';
  }

  function handleCourtClick(e) {
    if (!playerSelect.value || !gameSelect.value) return;
    var rect = courtSvg.getBoundingClientRect();
    var svgX = ((e.clientX - rect.left) / rect.width) * 500;
    var svgY = ((e.clientY - rect.top) / rect.height) * 470;
    // Convert to percentage (0-100)
    var xPct = Math.round((svgX / 500) * 100);
    var yPct = Math.round((svgY / 470) * 100);
    xPct = Math.max(0, Math.min(100, xPct));
    yPct = Math.max(0, Math.min(100, yPct));

    var shot = { x: xPct, y: yPct, made: shotResult };
    // Submit to API
    API.submitShotLocation(gameSelect.value, playerSelect.value, xPct, yPct, shotResult).then(function () {
      shots.push(shot);
      renderShots();
      showMsg(I18n.t('admin.shotRecorded'), 'success');
      setTimeout(function () { messageEl.hidden = true; }, 1500);
    }).catch(function (err) {
      showMsg(err.message || I18n.t('error.submitFailed'), 'error');
    });
  }

  function renderShots() {
    shotMarkers.innerHTML = '';
    var made = 0, missed = 0;
    shots.forEach(function (s) {
      var marker = document.createElement('div');
      marker.className = 'admin-shot-marker ' + (s.made ? 'admin-shot-marker--made' : 'admin-shot-marker--missed');
      marker.style.left = s.x + '%';
      marker.style.top = s.y + '%';
      marker.setAttribute('aria-label', s.made ? I18n.t('admin.shotMade') : I18n.t('admin.shotMissed'));
      shotMarkers.appendChild(marker);
      if (s.made) made++; else missed++;
    });
    var total = made + missed;
    statTotal.textContent = total;
    statMade.textContent = made;
    statMissed.textContent = missed;
    statPct.textContent = total > 0 ? Math.round((made / total) * 100) + '%' : '0%';
  }

  function undoLast() {
    if (shots.length === 0) return;
    shots.pop();
    renderShots();
  }

  function clearAll() {
    shots = [];
    renderShots();
  }

  function showMsg(text, type) {
    messageEl.textContent = text; messageEl.hidden = false;
    messageEl.className = 'admin-message admin-message--' + (type || 'info');
  }
})();
