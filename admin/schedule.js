/**
 * ALL-IN Basketball League — 賽程管理介面
 * 需求：8.1, 8.3, 8.5 + 單循環賽程生成
 */
(function () {
  'use strict';

  var seasonSelect = document.getElementById('season-select');
  var messageEl = document.getElementById('schedule-message');
  var createBtn = document.getElementById('btn-create-game');
  var playoffsBtn = document.getElementById('btn-generate-playoffs');
  var rrBtn = document.getElementById('btn-generate-round-robin');
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

  // Round-robin panel elements
  var rrPanel = document.getElementById('round-robin-panel');
  var rrMatchupsEl = document.getElementById('rr-matchups');
  var rrPublishBtn = document.getElementById('btn-rr-publish-all');
  var rrCloseBtn = document.getElementById('btn-rr-close');

  var teams = [];
  var editingGameId = null;
  var rrMatchups = []; // generated round-robin matchups

  loadSeasons();
  seasonSelect.addEventListener('change', onSeasonChange);
  createBtn.addEventListener('click', showCreateForm);
  cancelBtn.addEventListener('click', hideForm);
  saveBtn.addEventListener('click', handleSave);
  playoffsBtn.addEventListener('click', handleGeneratePlayoffs);
  rrBtn.addEventListener('click', showRoundRobinPanel);
  rrCloseBtn.addEventListener('click', hideRoundRobinPanel);
  rrPublishBtn.addEventListener('click', handlePublishAll);

  // ============================================================
  // Season / Team / Game loading
  // ============================================================

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
    rrBtn.disabled = !sid;
    hideForm();
    hideRoundRobinPanel();
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
        var statusBadge = '';
        if (g.status === 'cancelled') {
          statusBadge = ' <span class="badge badge--cancelled">' + I18n.t('admin.cancelled') + '</span>';
        }
        var cancelBtnHtml = g.status !== 'completed' && g.status !== 'cancelled'
          ? ' <button class="btn btn-sm btn-danger btn-cancel-game">' + I18n.t('admin.cancelGame') + '</button>'
          : '';
        tr.innerHTML =
          '<td>' + esc(Utils.formatDateWithDay(g.date)) + '</td>' +
          '<td>' + esc(Utils.formatTime(g.time)) + '</td>' +
          '<td>' + esc(g.venue || '') + '</td>' +
          '<td>' + esc(g.homeTeamName || g.homeTeamId) + ' vs ' + esc(g.awayTeamName || g.awayTeamId) +
            (g.status === 'completed' ? ' <span class="text-accent">' + (g.homeScore||0) + '-' + (g.awayScore||0) + '</span>' : '') +
            statusBadge + '</td>' +
          '<td>' + esc(g.type || 'regular') + '</td>' +
          '<td><button class="btn btn-sm btn-outline">' + I18n.t('admin.edit') + '</button>' + cancelBtnHtml + '</td>';
        tr.querySelector('.btn-outline').addEventListener('click', function () { showEditForm(g); });
        var cancelEl = tr.querySelector('.btn-cancel-game');
        if (cancelEl) {
          cancelEl.addEventListener('click', function () { handleCancelGame(g.id); });
        }
        gamesBody.appendChild(tr);
      });
    }).catch(function () { showMsg(I18n.t('error.loadFailed'), 'error'); });
  }

  // ============================================================
  // Create / Edit game form
  // ============================================================

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

  function handleCancelGame(gameId) {
    if (!confirm(I18n.t('admin.cancelGameConfirm'))) return;
    API.post('cancelGame', { gameId: gameId }).then(function () {
      showMsg(I18n.t('admin.gameCancelled'), 'success');
      loadGames(seasonSelect.value);
    }).catch(function (err) {
      showMsg(err.message || I18n.t('error.submitFailed'), 'error');
    });
  }

  // ============================================================
  // Round-Robin Generator (單循環)
  // ============================================================

  /**
   * Generate all matchups for a single round-robin tournament.
   * Uses the "circle method" — fix team[0], rotate the rest.
   * For N teams: N-1 rounds, N/2 games per round = N*(N-1)/2 total games.
   * @param {Array} teamList - array of {id, name}
   * @returns {Array} array of {round, homeId, awayId, homeName, awayName, date, time, venue}
   */
  function generateRoundRobin(teamList) {
    var n = teamList.length;
    var list = teamList.slice(); // copy
    // If odd number of teams, add a BYE placeholder
    if (n % 2 !== 0) {
      list.push({ id: '__BYE__', name: 'BYE' });
      n = list.length;
    }
    var rounds = n - 1;
    var half = n / 2;
    var matchups = [];
    // Circle method: fix list[0], rotate list[1..n-1]
    var fixed = list[0];
    var rotating = list.slice(1);

    for (var r = 0; r < rounds; r++) {
      var current = [fixed].concat(rotating);
      for (var i = 0; i < half; i++) {
        var home = current[i];
        var away = current[n - 1 - i];
        if (home.id === '__BYE__' || away.id === '__BYE__') continue;
        matchups.push({
          round: r + 1,
          homeId: home.id,
          awayId: away.id,
          homeName: home.name,
          awayName: away.name,
          date: '',
          time: '',
          venue: ''
        });
      }
      // Rotate: move last element to front of rotating array
      rotating.unshift(rotating.pop());
    }
    return matchups;
  }

  function showRoundRobinPanel() {
    if (teams.length < 2) {
      showMsg(I18n.t('admin.rrNeedTeams'), 'error');
      return;
    }
    rrMatchups = generateRoundRobin(teams);
    renderRoundRobin();
    rrPanel.hidden = false;
    rrPanel.scrollIntoView({ behavior: 'smooth' });
  }

  function hideRoundRobinPanel() {
    rrPanel.hidden = true;
    rrMatchups = [];
  }

  /**
   * Render the round-robin matchup table with inline editing.
   */
  function renderRoundRobin() {
    rrMatchupsEl.innerHTML = '';
    var currentRound = 0;

    rrMatchups.forEach(function (m, idx) {
      // Round header
      if (m.round !== currentRound) {
        currentRound = m.round;
        var header = document.createElement('div');
        header.className = 'rr-round-header';
        header.textContent = I18n.t('admin.rrRound') + ' ' + currentRound;
        rrMatchupsEl.appendChild(header);
      }

      var row = document.createElement('div');
      row.className = 'rr-match-row';
      row.setAttribute('data-idx', idx);

      // Home team select
      var homeSelHtml = buildTeamSelectHtml('rr-home-' + idx, m.homeId);
      // Away team select
      var awaySelHtml = buildTeamSelectHtml('rr-away-' + idx, m.awayId);

      var publishedClass = m.published ? ' rr-published' : '';
      var publishBtnHtml = m.published
        ? '<span class="badge badge--success">' + I18n.t('admin.published') + '</span>'
        : '<button class="btn btn-sm btn-primary rr-publish-btn">' + I18n.t('admin.publish') + '</button>';

      row.innerHTML =
        '<div class="rr-match-teams">' +
          homeSelHtml + ' <span class="rr-vs">vs</span> ' + awaySelHtml +
        '</div>' +
        '<div class="rr-match-details' + publishedClass + '">' +
          '<input type="date" class="admin-input rr-date" value="' + esc(m.date) + '"' + (m.published ? ' disabled' : '') + '>' +
          '<input type="time" class="admin-input rr-time" value="' + esc(m.time) + '"' + (m.published ? ' disabled' : '') + '>' +
          '<input type="text" class="admin-input rr-venue" placeholder="' + I18n.t('admin.gameVenue') + '" value="' + esc(m.venue) + '"' + (m.published ? ' disabled' : '') + '>' +
          publishBtnHtml +
        '</div>';

      rrMatchupsEl.appendChild(row);

      // Bind events
      var homeSelEl = row.querySelector('#rr-home-' + idx);
      var awaySelEl = row.querySelector('#rr-away-' + idx);
      var dateEl = row.querySelector('.rr-date');
      var timeEl = row.querySelector('.rr-time');
      var venueEl = row.querySelector('.rr-venue');

      homeSelEl.addEventListener('change', function () { handleTeamSwap(idx, 'home', this.value); });
      awaySelEl.addEventListener('change', function () { handleTeamSwap(idx, 'away', this.value); });
      dateEl.addEventListener('change', function () { rrMatchups[idx].date = this.value; updatePublishAllBtn(); });
      timeEl.addEventListener('change', function () { rrMatchups[idx].time = this.value; });
      venueEl.addEventListener('change', function () { rrMatchups[idx].venue = this.value; updatePublishAllBtn(); });

      var pubBtn = row.querySelector('.rr-publish-btn');
      if (pubBtn) {
        pubBtn.addEventListener('click', function () { publishSingleMatch(idx); });
      }
    });

    updatePublishAllBtn();
  }

  function buildTeamSelectHtml(id, selectedId) {
    var html = '<select id="' + id + '" class="admin-select rr-team-select">';
    teams.forEach(function (t) {
      html += '<option value="' + t.id + '"' + (t.id === selectedId ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    });
    html += '</select>';
    return html;
  }

  function updatePublishAllBtn() {
    var hasReady = rrMatchups.some(function (m) {
      return !m.published && m.date && m.venue;
    });
    rrPublishBtn.disabled = !hasReady;
  }

  // ============================================================
  // Team Swap — regenerate remaining matchups to keep 7 games each
  // ============================================================

  /**
   * When admin changes a team in a matchup, we need to:
   * 1. Update that specific matchup
   * 2. Regenerate all unpublished matchups to ensure every team still plays 7 games
   */
  function handleTeamSwap(changedIdx, side, newTeamId) {
    var m = rrMatchups[changedIdx];
    var oldTeamId = side === 'home' ? m.homeId : m.awayId;
    if (newTeamId === oldTeamId) return;

    // Prevent selecting same team for both sides
    if (side === 'home' && newTeamId === m.awayId) {
      showMsg(I18n.t('admin.rrSameTeam'), 'error');
      renderRoundRobin();
      return;
    }
    if (side === 'away' && newTeamId === m.homeId) {
      showMsg(I18n.t('admin.rrSameTeam'), 'error');
      renderRoundRobin();
      return;
    }

    // Apply the change
    if (side === 'home') {
      m.homeId = newTeamId;
      m.homeName = getTeamName(newTeamId);
    } else {
      m.awayId = newTeamId;
      m.awayName = getTeamName(newTeamId);
    }

    // Collect locked (published) matchups
    var locked = [];
    var unlocked = [];
    rrMatchups.forEach(function (match, i) {
      if (match.published) {
        locked.push(match);
      } else if (i === changedIdx) {
        locked.push(match); // treat the just-changed one as locked too
      } else {
        unlocked.push(match);
      }
    });

    // Count games per team from locked matchups
    var gameCount = {};
    teams.forEach(function (t) { gameCount[t.id] = 0; });
    var playedPairs = {};
    locked.forEach(function (match) {
      gameCount[match.homeId] = (gameCount[match.homeId] || 0) + 1;
      gameCount[match.awayId] = (gameCount[match.awayId] || 0) + 1;
      var pairKey = [match.homeId, match.awayId].sort().join('_');
      playedPairs[pairKey] = true;
    });

    var maxGames = teams.length - 1; // 7 for 8 teams

    // Generate all possible remaining pairs that haven't been played
    var neededPairs = [];
    for (var i = 0; i < teams.length; i++) {
      for (var j = i + 1; j < teams.length; j++) {
        var pKey = [teams[i].id, teams[j].id].sort().join('_');
        if (!playedPairs[pKey] && gameCount[teams[i].id] < maxGames && gameCount[teams[j].id] < maxGames) {
          neededPairs.push({ homeId: teams[i].id, awayId: teams[j].id });
        }
      }
    }

    // Greedily assign pairs ensuring no team exceeds maxGames
    var newMatchups = [];
    var tempCount = {};
    teams.forEach(function (t) { tempCount[t.id] = gameCount[t.id]; });

    neededPairs.forEach(function (pair) {
      if (tempCount[pair.homeId] < maxGames && tempCount[pair.awayId] < maxGames) {
        newMatchups.push({
          round: 0,
          homeId: pair.homeId,
          awayId: pair.awayId,
          homeName: getTeamName(pair.homeId),
          awayName: getTeamName(pair.awayId),
          date: '',
          time: '',
          venue: ''
        });
        tempCount[pair.homeId]++;
        tempCount[pair.awayId]++;
      }
    });

    // Re-assign round numbers to new matchups
    assignRounds(newMatchups);

    // Find max round from locked
    var maxLockedRound = 0;
    locked.forEach(function (m) { if (m.round > maxLockedRound) maxLockedRound = m.round; });
    newMatchups.forEach(function (m) { m.round += maxLockedRound; });

    // Merge: locked first, then new
    rrMatchups = locked.concat(newMatchups);
    renderRoundRobin();
    showMsg(I18n.t('admin.rrRegenerated'), 'success');
  }

  /**
   * Assign round numbers so no team plays twice in the same round.
   * Simple greedy coloring approach.
   */
  function assignRounds(matchups) {
    matchups.forEach(function (m) { m.round = 0; });
    matchups.forEach(function (m) {
      var round = 1;
      while (true) {
        var conflict = matchups.some(function (other) {
          return other.round === round && other !== m &&
            (other.homeId === m.homeId || other.homeId === m.awayId ||
             other.awayId === m.homeId || other.awayId === m.awayId);
        });
        if (!conflict) { m.round = round; break; }
        round++;
      }
    });
  }

  function getTeamName(teamId) {
    for (var i = 0; i < teams.length; i++) {
      if (teams[i].id === teamId) return teams[i].name;
    }
    return teamId;
  }

  // ============================================================
  // Publish matchups to the schedule (createGame API)
  // ============================================================

  function publishSingleMatch(idx) {
    var m = rrMatchups[idx];
    if (!m.date || !m.venue) {
      showMsg(I18n.t('admin.rrNeedDateVenue'), 'error');
      return;
    }
    var data = {
      seasonId: seasonSelect.value,
      date: m.date,
      time: m.time,
      venue: m.venue,
      homeTeamId: m.homeId,
      awayTeamId: m.awayId,
      type: 'regular'
    };
    API.post('createGame', data).then(function () {
      m.published = true;
      renderRoundRobin();
      loadGames(seasonSelect.value);
      showMsg(I18n.t('admin.gameSaved'), 'success');
    }).catch(function (err) {
      showMsg(err.message || I18n.t('error.submitFailed'), 'error');
    });
  }

  function handlePublishAll() {
    var toPublish = rrMatchups.filter(function (m) {
      return !m.published && m.date && m.venue;
    });
    if (toPublish.length === 0) return;

    if (!confirm(I18n.t('admin.rrPublishConfirm').replace('{count}', toPublish.length))) return;

    rrPublishBtn.disabled = true;
    var promises = toPublish.map(function (m) {
      return API.post('createGame', {
        seasonId: seasonSelect.value,
        date: m.date,
        time: m.time,
        venue: m.venue,
        homeTeamId: m.homeId,
        awayTeamId: m.awayId,
        type: 'regular'
      }).then(function () { m.published = true; });
    });

    Promise.all(promises).then(function () {
      showMsg(I18n.t('admin.rrPublished').replace('{count}', toPublish.length), 'success');
      renderRoundRobin();
      loadGames(seasonSelect.value);
    }).catch(function (err) {
      showMsg(err.message || I18n.t('error.submitFailed'), 'error');
    }).finally(function () { rrPublishBtn.disabled = false; });
  }

  // ============================================================
  // Utilities
  // ============================================================

  function showMsg(text, type) {
    messageEl.textContent = text; messageEl.hidden = false;
    messageEl.className = 'admin-message admin-message--' + (type || 'info');
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
})();
