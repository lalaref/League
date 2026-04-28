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

  // ============================================================
  // localStorage persistence for round-robin state
  // ============================================================
  function rrStorageKey() {
    return 'rr_matchups_' + (seasonSelect.value || 'default');
  }

  function saveRRState() {
    try {
      localStorage.setItem(rrStorageKey(), JSON.stringify(rrMatchups));
    } catch (e) { /* ignore */ }
  }

  function loadRRState() {
    try {
      var saved = localStorage.getItem(rrStorageKey());
      if (saved) {
        var parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function clearRRState() {
    try { localStorage.removeItem(rrStorageKey()); } catch (e) { /* ignore */ }
  }

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
    if (sid) {
      // Load teams and games together, then reconstruct RR panel
      Promise.all([
        API.getTeams(sid),
        API.getGames(sid)
      ]).then(function (results) {
        teams = results[0] || [];
        var games = results[1] || [];
        populateTeamSelects();
        renderGamesTable(games);
        restoreRRFromGames(games);
      }).catch(function () {
        showMsg(I18n.t('error.loadFailed'), 'error');
      });
    } else {
      gamesBody.innerHTML = '';
      teams = [];
      hideRoundRobinPanel();
    }
  }

  /**
   * Reconstruct the round-robin panel by merging:
   * 1. Published games already in the backend (marked as published)
   * 2. Unpublished matchups from localStorage (still need date/venue)
   * If no RR data exists at all, hide the panel.
   */
  function restoreRRFromGames(games) {
    // Only consider regular season games as RR candidates
    var regularGames = games.filter(function (g) {
      return g.type === 'regular' || !g.type;
    });

    var savedState = loadRRState();

    if (regularGames.length === 0 && !savedState) {
      hideRoundRobinPanel();
      return;
    }

    // Build published matchups from actual backend games
    var publishedMatchups = regularGames.map(function (g, i) {
      return {
        round: g.round || 0,
        homeId: g.homeTeamId,
        awayId: g.awayTeamId,
        homeName: g.homeTeamName || getTeamName(g.homeTeamId),
        awayName: g.awayTeamName || getTeamName(g.awayTeamId),
        date: g.date || '',
        time: g.time || '',
        venue: g.venue || '',
        published: true,
        gameId: g.id,
        status: g.status
      };
    });

    // Get unpublished matchups from localStorage (those not yet published)
    var unpublishedMatchups = [];
    if (savedState) {
      unpublishedMatchups = savedState.filter(function (m) { return !m.published; });
    }

    // If we have no unpublished and no published, nothing to show
    if (publishedMatchups.length === 0 && unpublishedMatchups.length === 0) {
      hideRoundRobinPanel();
      return;
    }

    // Assign round numbers to published matchups if missing
    if (publishedMatchups.length > 0 && publishedMatchups[0].round === 0) {
      assignRounds(publishedMatchups);
    }

    // Offset unpublished rounds after published ones
    var maxPublishedRound = 0;
    publishedMatchups.forEach(function (m) {
      if (m.round > maxPublishedRound) maxPublishedRound = m.round;
    });
    unpublishedMatchups.forEach(function (m) {
      if (m.round <= maxPublishedRound) m.round = maxPublishedRound + m.round;
    });

    rrMatchups = publishedMatchups.concat(unpublishedMatchups);

    // If we only have published games and no saved unpublished state,
    // generate the remaining unpublished matchups
    if (unpublishedMatchups.length === 0 && teams.length >= 2) {
      var allPairs = generateRoundRobin(teams);
      var publishedPairKeys = {};
      publishedMatchups.forEach(function (m) {
        publishedPairKeys[[m.homeId, m.awayId].sort().join('_')] = true;
      });
      var remaining = allPairs.filter(function (m) {
        return !publishedPairKeys[[m.homeId, m.awayId].sort().join('_')];
      });
      // Offset rounds
      remaining.forEach(function (m) { m.round += maxPublishedRound; });
      rrMatchups = publishedMatchups.concat(remaining);
    }

    saveRRState();
    rrPanel.hidden = false;
    renderRoundRobin();
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
      renderGamesTable(games);
    }).catch(function () { showMsg(I18n.t('error.loadFailed'), 'error'); });
  }

  function renderGamesTable(games) {
    gamesBody.innerHTML = '';
    // Build team map for jersey colors
    var teamMap = {};
    teams.forEach(function (t) { teamMap[t.id] = t; });

    (games || []).forEach(function (g) {
        var tr = document.createElement('tr');
        var statusBadge = '';
        if (g.status === 'cancelled') {
          statusBadge = ' <span class="badge badge--cancelled">' + I18n.t('admin.cancelled') + '</span>';
        }
        var cancelBtnHtml = g.status !== 'completed' && g.status !== 'cancelled'
          ? ' <button class="btn btn-sm btn-danger btn-cancel-game">' + I18n.t('admin.cancelGame') + '</button>'
          : '';
        var deleteBtnHtml = g.status === 'cancelled'
          ? ' <button class="btn btn-sm btn-danger btn-delete-game">' + I18n.t('admin.deleteGame') + '</button>'
          : '';

        // Jersey color info — editable inline inputs
        var homeTeam = teamMap[g.homeTeamId];
        var awayTeam = teamMap[g.awayTeamId];
        var homeJersey = homeTeam ? (homeTeam.jerseyHome || '') : '';
        var awayJersey = awayTeam ? (awayTeam.jerseyAway || '') : '';
        var homeJerseyBg = _jerseyColor(homeJersey);
        var awayJerseyBg = _jerseyColor(awayJersey);

        // Swatch + small editable text input
        var homeSwatchStyle = homeJerseyBg !== 'transparent' ? 'background:' + homeJerseyBg + ';' : 'background:#333;';
        var awaySwatchStyle = awayJerseyBg !== 'transparent' ? 'background:' + awayJerseyBg + ';' : 'background:#333;';

        var homeJerseyHtml = ' <span class="jersey-swatch" style="' + homeSwatchStyle + '"></span>' +
          '<input type="text" class="jersey-input jersey-home-input" value="' + esc(homeJersey) + '" placeholder="球衣色" data-team-id="' + (g.homeTeamId || '') + '" data-side="home" title="主場球衣顏色（輸入後按 Enter 儲存）">';
        var awayJerseyHtml = ' <span class="jersey-swatch" style="' + awaySwatchStyle + '"></span>' +
          '<input type="text" class="jersey-input jersey-away-input" value="' + esc(awayJersey) + '" placeholder="球衣色" data-team-id="' + (g.awayTeamId || '') + '" data-side="away" title="客場球衣顏色（輸入後按 Enter 儲存）">';

        tr.innerHTML =
          '<td>' + esc(Utils.formatDateWithDay(g.date)) + '</td>' +
          '<td>' + esc(Utils.formatTime(g.time)) + '</td>' +
          '<td>' + esc(g.venue || '') + '</td>' +
          '<td><span class="matchup-team">' + esc(g.homeTeamName || g.homeTeamId) + homeJerseyHtml + '</span> vs <span class="matchup-team">' + esc(g.awayTeamName || g.awayTeamId) + awayJerseyHtml + '</span>' +
            (g.status === 'completed' ? ' <span class="text-accent">' + (g.homeScore||0) + '-' + (g.awayScore||0) + '</span>' : '') +
            statusBadge + '</td>' +
          '<td>' + esc(g.type || 'regular') + '</td>' +
          '<td><button class="btn btn-sm btn-outline">' + I18n.t('admin.edit') + '</button>' + cancelBtnHtml + deleteBtnHtml + '</td>';

        // Bind jersey color input events
        tr.querySelectorAll('.jersey-input').forEach(function (inp) {
          // Live swatch preview on input
          inp.addEventListener('input', function () {
            var swatch = inp.previousElementSibling;
            var val = inp.value.trim();
            var bg = _jerseyColor(val);
            if (swatch) swatch.style.background = bg !== 'transparent' ? bg : '#333';
          });
          // Save on Enter or blur
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); _saveJerseyColor(inp); }
          });
          inp.addEventListener('blur', function () { _saveJerseyColor(inp); });
        });

        tr.querySelector('.btn-outline').addEventListener('click', function () { showEditForm(g); });
        var cancelEl = tr.querySelector('.btn-cancel-game');
        if (cancelEl) {
          cancelEl.addEventListener('click', function () { handleCancelGame(g.id); });
        }
        var deleteEl = tr.querySelector('.btn-delete-game');
        if (deleteEl) {
          deleteEl.addEventListener('click', function () { handleDeleteGame(g.id); });
        }
        gamesBody.appendChild(tr);
      });
  }

  /**
   * Map Chinese color names to hex for jersey badge display
   */
  function _jerseyColor(color) {
    if (!color) return 'transparent';
    var map = {
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
    return map[color] || (color.charAt(0) === '#' ? color : 'transparent');
  }

  /**
   * Save jersey color change to the team via API.
   * Updates jerseyHome or jerseyAway on the team record.
   */
  function _saveJerseyColor(inp) {
    var teamId = inp.getAttribute('data-team-id');
    var side = inp.getAttribute('data-side');
    var newColor = inp.value.trim();
    if (!teamId) return;

    // Find original value to avoid unnecessary saves
    var team = null;
    for (var i = 0; i < teams.length; i++) {
      if (teams[i].id === teamId) { team = teams[i]; break; }
    }
    if (!team) return;

    var origColor = side === 'home' ? (team.jerseyHome || '') : (team.jerseyAway || '');
    if (newColor === origColor) return; // no change

    // Update local cache immediately
    if (side === 'home') {
      team.jerseyHome = newColor;
    } else {
      team.jerseyAway = newColor;
    }

    // Build update payload
    var data = { teamId: teamId };
    if (side === 'home') {
      data.jerseyHome = newColor;
    } else {
      data.jerseyAway = newColor;
    }

    // Also send existing fields to avoid overwriting
    data.seasonId = seasonSelect.value;
    data.name = team.name || '';

    API.post('updateTeam', data).then(function () {
      showMsg('球衣顏色已更新', 'success');
    }).catch(function (err) {
      showMsg(err.message || '球衣顏色更新失敗', 'error');
    });
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
    // If ISO with Z (UTC), parse to local date
    if (s.indexOf('T') !== -1 && s.indexOf('Z') !== -1) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) {
        var y = d.getFullYear();
        var m = d.getMonth() + 1;
        var day = d.getDate();
        return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
      }
    }
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
      API.getGames(seasonSelect.value).then(function (games) {
        renderGamesTable(games);
        restoreRRFromGames(games);
      });
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
    API.post('cancelGame', { gameId: gameId, seasonId: seasonSelect.value }).then(function () {
      showMsg(I18n.t('admin.gameCancelled'), 'success');
      API.getGames(seasonSelect.value).then(function (games) {
        renderGamesTable(games);
        restoreRRFromGames(games);
      });
    }).catch(function (err) {
      showMsg(err.message || I18n.t('error.submitFailed'), 'error');
    });
  }

  function handleDeleteGame(gameId) {
    if (!confirm(I18n.t('admin.deleteGameConfirm'))) return;
    API.post('deleteGame', { gameId: gameId, seasonId: seasonSelect.value }).then(function () {
      showMsg(I18n.t('admin.gameDeleted'), 'success');
      API.getGames(seasonSelect.value).then(function (games) {
        renderGamesTable(games);
        restoreRRFromGames(games);
      });
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
    saveRRState();
    renderRoundRobin();
    rrPanel.hidden = false;
    rrPanel.scrollIntoView({ behavior: 'smooth' });
  }

  function hideRoundRobinPanel() {
    rrPanel.hidden = true;
    rrMatchups = [];
    clearRRState();
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
      dateEl.addEventListener('input', function () { rrMatchups[idx].date = this.value; saveRRState(); updatePublishAllBtn(); });
      timeEl.addEventListener('input', function () { rrMatchups[idx].time = this.value; saveRRState(); });
      venueEl.addEventListener('input', function () { rrMatchups[idx].venue = this.value; saveRRState(); updatePublishAllBtn(); });

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
    saveRRState();
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
    // Read directly from DOM inputs in case change event hasn't fired yet
    var row = rrMatchupsEl.querySelector('[data-idx="' + idx + '"]');
    if (row) {
      m.date = row.querySelector('.rr-date').value;
      m.time = row.querySelector('.rr-time').value;
      m.venue = row.querySelector('.rr-venue').value;
    }
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
      saveRRState();
      API.getGames(seasonSelect.value).then(function (games) {
        renderGamesTable(games);
        restoreRRFromGames(games);
      });
      showMsg(I18n.t('admin.gameSaved'), 'success');
    }).catch(function (err) {
      showMsg(err.message || I18n.t('error.submitFailed'), 'error');
    });
  }

  function handlePublishAll() {
    // Sync all DOM input values into rrMatchups before checking
    rrMatchups.forEach(function (m, idx) {
      if (m.published) return;
      var row = rrMatchupsEl.querySelector('[data-idx="' + idx + '"]');
      if (row) {
        m.date = row.querySelector('.rr-date').value;
        m.time = row.querySelector('.rr-time').value;
        m.venue = row.querySelector('.rr-venue').value;
      }
    });
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
      saveRRState();
      showMsg(I18n.t('admin.rrPublished').replace('{count}', toPublish.length), 'success');
      API.getGames(seasonSelect.value).then(function (games) {
        renderGamesTable(games);
        restoreRRFromGames(games);
      });
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
