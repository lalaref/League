/**
 * ALL-IN Basketball League — 賽程管理介面
 * 需求：8.1, 8.3, 8.5
 */
(function () {
  'use strict';

  var seasonSelect = document.getElementById('season-select');
  var messageEl = document.getElementById('schedule-message');
  var createBtn = document.getElementById('btn-create-game');
  var playoffsBtn = document.getElementById('btn-generate-playoffs');
  var gameForm = document.getElementById('game-form');
  var formTitle = document.getElementById('game-form-title');
  var saveBtn = document.getElementById('btn-save-game');
  var cancelBtn = document.getElementById('btn-cancel-game');
  var gamesBody = document.getElementById('games-body');

  var dateInput = document.getElementById('game-date');
  var timeInput = document.getElementById('game-time');
  var venueInput = document.getElementById('game-venue');
  var homeSelect = document.getElementById('home-team-select');
  var awaySelect = document.getElementById('away-team-select');
  var typeSelect = document.getElementById('game-type');

  var teams = [];
  var editingGameId = null;

  loadSeasons();
  seasonSelect.addEventListener('change', onSeasonChange);
  createBtn.addEventListener('click', showCreateForm);
  cancelBtn.addEventListener('click', hideForm);
  saveBtn.addEventListener('click', handleSave);
  playoffsBtn.addEventListener('click', handleGeneratePlayoffs);

  function loadSeasons() {
    API.getSeasons().then(function (seasons) {
      seasonSelect.innerHTML = '<option value="">--</option>';
      var activeId = '';
      (seasons || []).forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.name;
        if (s.status === 'active' && !activeId) activeId = s.id;
        seasonSelect.appendChild(o);
      });
      if (activeId) { seasonSelect.value = activeId; onSeasonChange(); }
    }).catch(function () { showMsg(I18n.t('error.loadFailed'), 'error'); });
  }

  function onSeasonChange() {
    var sid = seasonSelect.value;
    createBtn.disabled = !sid;
    playoffsBtn.disabled = !sid;
    hideForm();
    if (sid) { loadTeams(sid); loadGames(sid); }
    else { gamesBody.innerHTML = ''; teams = []; }
  }

  function loadTeams(seasonId) {
    API.getTeams(seasonId).then(function (t) {
      teams = t || [];
      populateTeamSelects();
    }).catch(function () { teams = []; });
  }

  function populateTeamSelects() {
    [homeSelect, awaySelect].forEach(function (sel) {
      sel.innerHTML = '<option value="">--</option>';
      teams.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.id; o.textContent = t.name;
        sel.appendChild(o);
      });
    });
  }

  function loadGames(seasonId) {
    API.getGames(seasonId).then(function (games) {
      gamesBody.innerHTML = '';
      (games || []).forEach(function (g) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + esc(Utils.formatDateWithDay(g.date)) + '</td>' +
          '<td>' + esc(Utils.formatTime(g.time)) + '</td>' +
          '<td>' + esc(g.venue || '') + '</td>' +
          '<td>' + esc(g.homeTeamName || g.homeTeamId) + ' vs ' + esc(g.awayTeamName || g.awayTeamId) +
            (g.status === 'completed' ? ' <span class="text-accent">' + (g.homeScore||0) + '-' + (g.awayScore||0) + '</span>' : '') + '</td>' +
          '<td>' + esc(g.type || 'regular') + '</td>' +
          '<td><button class="btn btn-sm btn-outline" data-game-id="' + g.id + '">' + I18n.t('admin.edit') + '</button></td>';
        tr.querySelector('button').addEventListener('click', function () { showEditForm(g); });
        gamesBody.appendChild(tr);
      });
    }).catch(function () { showMsg(I18n.t('error.loadFailed'), 'error'); });
  }

  function showCreateForm() {
    editingGameId = null;
    formTitle.textContent = I18n.t('admin.createGame');
    dateInput.value = ''; timeInput.value = ''; venueInput.value = '';
    homeSelect.value = ''; awaySelect.value = ''; typeSelect.value = 'regular';
    gameForm.hidden = false;
    gameForm.scrollIntoView({ behavior: 'smooth' });
  }

  function _toDateInput(raw) {
    if (!raw) return '';
    var s = String(raw);
    return s.indexOf('T') !== -1 ? s.split('T')[0] : s;
  }
  function _toTimeInput(raw) {
    if (!raw) return '';
    return Utils.formatTime(raw);
  }

  function showEditForm(g) {
    editingGameId = g.id;
    formTitle.textContent = I18n.t('admin.editGame');
    dateInput.value = _toDateInput(g.date);
    timeInput.value = _toTimeInput(g.time);
    venueInput.value = g.venue || '';
    homeSelect.value = g.homeTeamId || '';
    awaySelect.value = g.awayTeamId || '';
    typeSelect.value = g.type || 'regular';
    gameForm.hidden = false;
    gameForm.scrollIntoView({ behavior: 'smooth' });
  }

  function hideForm() { gameForm.hidden = true; editingGameId = null; }

  function handleSave() {
    if (!dateInput.value || !homeSelect.value || !awaySelect.value) {
      showMsg(I18n.t('error.invalidData'), 'error'); return;
    }
    saveBtn.disabled = true;
    var data = {
      seasonId: seasonSelect.value,
      date: dateInput.value,
      time: timeInput.value,
      venue: venueInput.value,
      homeTeamId: homeSelect.value,
      awayTeamId: awaySelect.value,
      type: typeSelect.value
    };
    var action = editingGameId ? 'updateGame' : 'createGame';
    if (editingGameId) data.gameId = editingGameId;

    API.post(action, data).then(function () {
      showMsg(I18n.t('admin.gameSaved'), 'success');
      hideForm();
      loadGames(seasonSelect.value);
    }).catch(function (err) {
      showMsg(err.message || I18n.t('error.submitFailed'), 'error');
    }).finally(function () { saveBtn.disabled = false; });
  }

  function handleGeneratePlayoffs() {
    if (!confirm(I18n.t('admin.generatePlayoffsConfirm'))) return;
    playoffsBtn.disabled = true;
    API.post('generatePlayoffs', { seasonId: seasonSelect.value }).then(function () {
      showMsg(I18n.t('admin.playoffsGenerated'), 'success');
      loadGames(seasonSelect.value);
    }).catch(function (err) {
      showMsg(err.message || I18n.t('error.submitFailed'), 'error');
    }).finally(function () { playoffsBtn.disabled = false; });
  }

  function showMsg(text, type) {
    messageEl.textContent = text; messageEl.hidden = false;
    messageEl.className = 'admin-message admin-message--' + (type || 'info');
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
})();
