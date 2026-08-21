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
  var playoffSettings = document.getElementById('playoff-game-settings');
  var playoffSeedSelect = document.getElementById('game-playoff-seed');
  var playoffRoundSelect = document.getElementById('game-playoff-round');
  var playoffNotesInput = document.getElementById('game-playoff-notes');

  // Round-robin panel elements
  var rrPanel = document.getElementById('round-robin-panel');
  var rrMatchupsEl = document.getElementById('rr-matchups');
  var rrPublishBtn = document.getElementById('btn-rr-publish-all');
  var rrCloseBtn = document.getElementById('btn-rr-close');

  // Season 2 playoff graph elements
  var playoffPanel = document.getElementById('playoff-panel');
  var playoffStatusEl = document.getElementById('playoff-status');
  var playoffBracketsEl = document.getElementById('playoff-brackets');

  var teams = [];
  var seasons = [];
  var seasonOneTeams = [];
  var editingGameId = null;
  var rrMatchups = []; // generated round-robin matchups
  var SEASON2_TARGET_GAMES = 5;
  var SEASON1_ID = '845ca40d-4346-448f-bbe2-06b4104bdbda';

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
  typeSelect.addEventListener('change', updatePlayoffSettings);
  playoffsBtn.addEventListener('click', handleGeneratePlayoffs);
  rrBtn.addEventListener('click', showRoundRobinPanel);
  rrCloseBtn.addEventListener('click', hideRoundRobinPanel);
  rrPublishBtn.addEventListener('click', handlePublishAll);

  // ============================================================
  // Season / Team / Game loading
  // ============================================================

  function loadSeasons() {
    API.getSeasons().then(function (seasonList) {
      seasons = seasonList || [];
      seasonSelect.innerHTML = '<option value="">--</option>';
      var defaultSeason = getDefaultSeason(seasons);
      seasons.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.name;
        seasonSelect.appendChild(o);
      });
      if (defaultSeason) { seasonSelect.value = defaultSeason.id; onSeasonChange(); }
    }).catch(function () { showMsg(I18n.t('error.loadFailed'), 'error'); });
  }

  function getDefaultSeason(seasons) {
    for (var s2 = 0; s2 < seasons.length; s2++) {
      if (isActiveSeason(seasons[s2]) && isSeasonTwo(seasons[s2])) return seasons[s2];
    }
    for (var i = seasons.length - 1; i >= 0; i--) {
      if (isActiveSeason(seasons[i])) return seasons[i];
    }
    return seasons[seasons.length - 1];
  }

  function isActiveSeason(season) {
    return season && String(season.status || '').toLowerCase() === 'active';
  }

  function isSeasonTwo(season) {
    var name = String((season && (season.name || season.id)) || '').toLowerCase();
    return /(?:season|s)\s*0?2\b/.test(name) || name.indexOf('第二季') !== -1 || name.indexOf('第2季') !== -1;
  }

  function isSeasonOne(season) {
    var name = String((season && (season.name || season.id)) || '').toLowerCase();
    return !!season && (String(season.id || '') === SEASON1_ID || /(?:season|s)\s*0?1\b/.test(name) || name.indexOf('第一季') !== -1 || String(season.minGamesForRanking || '') === '7');
  }

  function getCurrentSeason() {
    return seasons.filter(function (season) { return String(season.id || '') === String(seasonSelect.value || ''); })[0] || null;
  }

  function isCurrentSeasonOne() {
    return isSeasonOne(getCurrentSeason());
  }

  function onSeasonChange() {
    var sid = seasonSelect.value;
    var currentSeason = getCurrentSeason();
    createBtn.disabled = !sid;
    playoffsBtn.disabled = !sid || !isSeasonTwo(currentSeason);
    rrBtn.disabled = !sid || !isSeasonTwo(currentSeason);
    hideForm();
    if (sid) {
      // Load schedule, standings, and playoffs together so the graph is always current.
      Promise.all([
        API.getTeams(sid),
        API.getGames(sid),
        API.getTeams(SEASON1_ID).catch(function () { return []; }),
        API.getStandings(sid).catch(function () { return []; }),
        API.getPlayoffs(sid).catch(function () { return { brackets: [] }; })
      ]).then(function (results) {
        teams = results[0] || [];
        var games = results[1] || [];
        seasonOneTeams = results[2] || [];
        populateTeamSelects();
        renderGamesTable(games);
        restoreRRFromGames(games);
        renderPlayoffGraph(results[3], results[4]);
      }).catch(function () {
        showMsg(I18n.t('error.loadFailed'), 'error');
      });
    } else {
      gamesBody.innerHTML = '';
      teams = [];
      seasonOneTeams = [];
      hideRoundRobinPanel();
      playoffPanel.hidden = true;
      playoffBracketsEl.innerHTML = '';
    }
  }

  /**
   * Capture only editable scheduling fields from local drafts. Team pairings
   * and published state always come from the backend, never localStorage.
   */
  function getRRDraftFields(source) {
    var drafts = {};
    (source || []).forEach(function (match) {
      if (match.published || !match.homeId || !match.awayId) return;
      drafts[pairKey(match.homeId, match.awayId)] = {
        date: match.date || '',
        time: match.time || '',
        venue: match.venue || ''
      };
    });
    return drafts;
  }

  function syncRRInputs() {
    rrMatchups.forEach(function (match, idx) {
      if (match.published) return;
      var row = rrMatchupsEl.querySelector('[data-idx="' + idx + '"]');
      if (!row) return;
      match.date = row.querySelector('.rr-date').value;
      match.time = row.querySelector('.rr-time').value;
      match.venue = row.querySelector('.rr-venue').value;
    });
  }

  /**
   * Rebuild around authoritative backend records. Every non-cancelled regular
   * game, including completed games, is locked and counts toward five games.
   * Saved drafts may restore date/time/venue only for regenerated new pairs.
   */
  function restoreRRFromGames(games, draftSource, forceShow) {
    var regularGames = (games || []).filter(function (g) {
      return String(g.type || 'regular').trim().toLowerCase() === 'regular' &&
        String(g.status || 'scheduled').trim().toLowerCase() !== 'cancelled';
    });
    var publishedMatchups = regularGames.map(function (g) {
      return {
        round: g.round || 0,
        division: getMatchDivision(g.homeTeamId, g.awayTeamId),
        homeId: g.homeTeamId,
        awayId: g.awayTeamId,
        homeName: g.homeTeamName || getTeamName(g.homeTeamId),
        awayName: g.awayTeamName || getTeamName(g.awayTeamId),
        date: g.date || '', time: g.time || '', venue: g.venue || '',
        published: true, gameId: g.id, status: g.status || 'scheduled'
      };
    });

    var drafts = getRRDraftFields(draftSource || loadRRState() || []);
    if (!publishedMatchups.length && !forceShow) {
      rrMatchups = [];
      rrPanel.hidden = true;
      return;
    }

    rrMatchups = generateRoundRobin(teams, publishedMatchups);
    rrMatchups.forEach(function (match) {
      if (match.published) return;
      var draft = drafts[pairKey(match.homeId, match.awayId)];
      if (!draft) return;
      match.date = draft.date;
      match.time = draft.time;
      match.venue = draft.venue;
    });
    saveRRState();
    rrPanel.hidden = false;
    renderRoundRobin();
  }

  function refreshScheduleFromBackend(draftSource, forceShow) {
    var sid = seasonSelect.value;
    return Promise.all([API.getTeams(sid), API.getGames(sid)]).then(function (results) {
      if (!Array.isArray(results[0])) throw new Error('後端球隊資料格式不正確，請更新 Apps Script 部署後再試。');
      teams = results[0];
      var games = Array.isArray(results[1]) ? results[1] : [];
      populateTeamSelects();
      renderGamesTable(games);
      restoreRRFromGames(games, draftSource, forceShow);
      return games;
    });
  }

  function blockRRUntilReload() {
    rrMatchups = [];
    clearRRState();
    rrMatchupsEl.innerHTML = '<p class="admin-hint">無法確認後端最新賽程，發佈功能已暫停。請按「生成賽程」重新載入。</p>';
    rrPanel.hidden = false;
    rrPublishBtn.disabled = true;
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

  function formatGameType(game) {
    if (String(game.type || '').toLowerCase() !== 'playoff') return game.type || 'regular';
    var seed = game.playoffSeed === 'consolation' ? '安慰賽／排名組' : (game.playoffSeed === 'champions' ? '冠軍組' : '未設定組別');
    var round = Number(game.playoffRound) || 1;
    var stage = isCurrentSeasonOne()
      ? (round === 2 ? '決賽' : '準決賽')
      : (round === 3 ? '決賽' : (round === 2 ? '準決賽' : '首輪'));
    return 'playoff · ' + seed + ' · ' + stage;
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
          '<td>' + esc(formatGameType(g)) + '</td>' +
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

  function updatePlayoffSettings(preferredRound) {
    var isPlayoff = typeSelect.value === 'playoff';
    playoffSettings.hidden = !isPlayoff;
    if (!isPlayoff) return;

    var options = isCurrentSeasonOne()
      ? [{ value: '1', label: '準決賽（第 1 輪）' }, { value: '2', label: '決賽（第 2 輪）' }]
      : [{ value: '1', label: '首輪（第 1 輪）' }, { value: '2', label: '準決賽（第 2 輪）' }, { value: '3', label: '決賽（第 3 輪）' }];
    var selected = String(preferredRound || playoffRoundSelect.value || '1');
    playoffRoundSelect.innerHTML = '';
    options.forEach(function (option) {
      var el = document.createElement('option');
      el.value = option.value;
      el.textContent = option.label;
      playoffRoundSelect.appendChild(el);
    });
    playoffRoundSelect.value = options.some(function (option) { return option.value === selected; }) ? selected : '1';
  }

  function showCreateForm() {
    editingGameId = null;
    formTitle.textContent = I18n.t('admin.createGame');
    dateInput.value = ''; timeInput.value = ''; venueInput.value = '';
    homeSelect.value = ''; awaySelect.value = ''; typeSelect.value = 'regular';
    playoffSeedSelect.value = 'champions';
    playoffNotesInput.value = '';
    updatePlayoffSettings('1');
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
    playoffSeedSelect.value = g.playoffSeed || 'champions';
    playoffNotesInput.value = g.notes || '';
    updatePlayoffSettings(g.playoffRound || '1');
    gameForm.hidden = false;
    gameForm.scrollIntoView({ behavior: 'smooth' });
  }

  function hideForm() {
    gameForm.hidden = true;
    playoffSettings.hidden = true;
    editingGameId = null;
  }

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
    if (data.type === 'playoff') {
      data.playoffSeed = playoffSeedSelect.value;
      data.playoffRound = Number(playoffRoundSelect.value);
      data.notes = playoffNotesInput.value.trim();
      if (!data.playoffSeed || !data.playoffRound) {
        saveBtn.disabled = false;
        showMsg('請選擇季後賽組別及階段。', 'error');
        return;
      }
    }
    var action = editingGameId ? 'updateGame' : 'createGame';
    if (editingGameId) data.gameId = editingGameId;

    API.post(action, data).then(function () {
      showMsg(I18n.t('admin.gameSaved'), 'success');
      hideForm();
      return Promise.all([
        API.getGames(seasonSelect.value),
        API.getStandings(seasonSelect.value).catch(function () { return []; }),
        API.getPlayoffs(seasonSelect.value).catch(function () { return { rounds: [], brackets: [] }; })
      ]).then(function (results) {
        renderGamesTable(results[0]);
        restoreRRFromGames(results[0]);
        renderPlayoffGraph(results[1], results[2]);
      });
    }).catch(function (err) {
      showMsg(err.message || I18n.t('error.submitFailed'), 'error');
    }).finally(function () { saveBtn.disabled = false; });
  }

  function handleGeneratePlayoffs() {
    if (!confirm(I18n.t('admin.generatePlayoffsConfirm'))) return;
    var sid = seasonSelect.value;
    playoffsBtn.disabled = true;
    API.post('generatePlayoffs', { seasonId: sid }).then(function () {
      showMsg(I18n.t('admin.playoffsGenerated'), 'success');
      return Promise.all([
        API.getGames(sid),
        API.getStandings(sid),
        API.getPlayoffs(sid)
      ]);
    }).then(function (results) {
      renderGamesTable(results[0] || []);
      restoreRRFromGames(results[0] || []);
      renderPlayoffGraph(results[1] || [], results[2] || { brackets: [] });
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
  function generateSingleRoundRobin(teamList, division) {
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
          division: division || '',
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

  function generateRoundRobin(teamList, lockedMatchups) {
    var divisionGroups = {};
    var hasDivision = teamList.some(function (t) { return !!(t.division || '').trim(); });
    if (!hasDivision) return generateSingleRoundRobin(teamList, '');

    teamList.forEach(function (t) {
      var division = normalizeDivision(t);
      if (!divisionGroups[division]) divisionGroups[division] = [];
      divisionGroups[division].push(t);
    });

    var allMatchups = generateSeason2FiveGameSchedule(divisionGroups, lockedMatchups || []);
    return allMatchups;
  }

  function generateSeason2FiveGameSchedule(divisionGroups, lockedMatchups) {
    var divisionKeys = Object.keys(divisionGroups);
    var clutchKey = divisionKeys.indexOf('CLUTCH') !== -1 ? 'CLUTCH' : '';
    var fastbreakKey = divisionKeys.indexOf('FASTBREAK') !== -1 ? 'FASTBREAK' : '';
    if (divisionKeys.length !== 2 || !clutchKey || !fastbreakKey || divisionGroups[clutchKey].length !== 8 || divisionGroups[fastbreakKey].length !== 8) {
      showMsg('Season 2 賽程需要 Clutch 及 Fastbreak 兩組，每組必須正好 8 隊。', 'error');
      return (lockedMatchups || []).slice();
    }

    var orderedDivisions = [clutchKey, fastbreakKey];
    var allTeams = [], teamById = {}, counts = {}, usedPairs = {}, preferredPairs = {};
    orderedDivisions.forEach(function (division) {
      var group = divisionGroups[division].slice().sort(compareTeamName);
      group.forEach(function (team) { allTeams.push(team); teamById[team.id] = team; counts[team.id] = 0; });
      [1, 2, 4].forEach(function (offset) {
        for (var i = 0; i < group.length; i++) preferredPairs[pairKey(group[i].id, group[(i + offset) % group.length].id)] = true;
      });
    });

    var result = (lockedMatchups || []).slice();
    var invalidRecord = false;
    result.forEach(function (match) {
      if (!teamById[match.homeId] || !teamById[match.awayId] || match.homeId === match.awayId) { invalidRecord = true; return; }
      counts[match.homeId]++; counts[match.awayId]++;
      usedPairs[pairKey(match.homeId, match.awayId)] = true;
      if (counts[match.homeId] > SEASON2_TARGET_GAMES || counts[match.awayId] > SEASON2_TARGET_GAMES) invalidRecord = true;
    });
    if (invalidRecord) {
      showMsg('現有比賽記錄無法配合每隊 5 場的規則；已保留所有記錄，未新增比賽。', 'error');
      return result;
    }

    var deficits = {};
    allTeams.forEach(function (team) { deficits[team.id] = SEASON2_TARGET_GAMES - counts[team.id]; });
    var additions = [], attempts = 0;
    var searchDeadline = Date.now() + 100;
    var maxAttempts = 5000;

    // A new season has a deterministic 5-game schedule: offsets 1, 2 and 4
    // create 20 unique games per eight-team division (40 games total).
    if (!result.length) {
      orderedDivisions.forEach(function (division) {
        var group = divisionGroups[division].slice().sort(compareTeamName);
        additions = additions.concat(generateCircularDivisionPairs(group, division, [1, 2, 4]));
      });
    } else if (!completeRemainingGames()) {
      showMsg('已保留所有現有比賽，但無法在限時內自動安排餘下賽事至每隊 5 場。請檢查現有對賽是否重複，或有隊伍已超過 5 場。', 'error');
      return result;
    }

    result = result.concat(additions);
    assignRounds(result);
    var divisionOrder = { CLUTCH:0, FASTBREAK:1, CROSS:2 };
    result.sort(function (a, b) {
      var aOrder = divisionOrder[String(a.division || '').toUpperCase()];
      var bOrder = divisionOrder[String(b.division || '').toUpperCase()];
      return (aOrder === undefined ? 3 : aOrder) - (bOrder === undefined ? 3 : bOrder) || a.round - b.round || compareTeamName({ name:a.homeName }, { name:b.homeName });
    });
    return result;

    function availablePartners(teamId) {
      return allTeams.filter(function (team) {
        return team.id !== teamId && deficits[team.id] > 0 && !usedPairs[pairKey(teamId, team.id)];
      });
    }

    function completeRemainingGames() {
      attempts++;
      if (attempts > maxAttempts || Date.now() > searchDeadline) return false;
      var remaining = allTeams.filter(function (team) { return deficits[team.id] > 0; });
      if (!remaining.length) return true;
      var slots = remaining.reduce(function (sum, team) { return sum + deficits[team.id]; }, 0);
      if (slots % 2 !== 0) return false;

      var chosen = null, chosenPartners = null;
      for (var i = 0; i < remaining.length; i++) {
        var partners = availablePartners(remaining[i].id);
        if (partners.length < deficits[remaining[i].id]) return false;
        if (!chosen || partners.length - deficits[remaining[i].id] < chosenPartners.length - deficits[chosen.id]) {
          chosen = remaining[i]; chosenPartners = partners;
        }
      }
      chosenPartners.sort(function (a, b) {
        var aKey = pairKey(chosen.id, a.id), bKey = pairKey(chosen.id, b.id);
        var aScore = preferredPairs[aKey] ? 0 : (normalizeDivision(chosen) === normalizeDivision(a) ? 1 : 2);
        var bScore = preferredPairs[bKey] ? 0 : (normalizeDivision(chosen) === normalizeDivision(b) ? 1 : 2);
        return aScore - bScore || deficits[b.id] - deficits[a.id] || compareTeamName(a, b);
      });

      for (var p = 0; p < chosenPartners.length; p++) {
        var opponent = chosenPartners[p];
        var key = pairKey(chosen.id, opponent.id);
        usedPairs[key] = true; deficits[chosen.id]--; deficits[opponent.id]--;
        additions.push(makeMatchup(chosen, opponent, normalizeDivision(chosen) === normalizeDivision(opponent) ? normalizeDivision(chosen) : 'Cross'));
        if (completeRemainingGames()) return true;
        additions.pop(); deficits[chosen.id]++; deficits[opponent.id]++; delete usedPairs[key];
      }
      return false;
    }
  }

  function generateCircularDivisionPairs(group, division, offsets) {
    var matchups = [];
    var n = group.length;
    var used = {};
    offsets.forEach(function (offset) {
      for (var i = 0; i < n; i++) {
        var j = (i + offset) % n;
        var key = pairKey(group[i].id, group[j].id);
        if (!used[key]) {
          used[key] = true;
          matchups.push(makeMatchup(group[i], group[j], division));
        }
      }
    });
    return matchups;
  }

  function generateSevenTeamDivisionPairs(group, division) {
    var skipped = chooseSkippedCycle(group);
    var skippedKeys = {};
    skipped.forEach(function (pair) { skippedKeys[pairKey(pair[0].id, pair[1].id)] = true; });
    var matchups = [];
    for (var i = 0; i < group.length; i++) {
      for (var j = i + 1; j < group.length; j++) {
        if (!skippedKeys[pairKey(group[i].id, group[j].id)]) matchups.push(makeMatchup(group[i], group[j], division));
      }
    }
    return matchups;
  }

  function chooseSkippedCycle(group) {
    var bestCycle = null;
    var bestScore = -Infinity;
    var first = group[0];
    var rest = group.slice(1);
    permute(rest, 0);
    return bestCycle || buildCycle(group);

    function permute(items, index) {
      if (index === items.length) {
        var cycle = buildCycle([first].concat(items));
        var score = scoreSkippedCycle(cycle);
        if (score > bestScore) {
          bestScore = score;
          bestCycle = cycle;
        }
        return;
      }
      for (var i = index; i < items.length; i++) {
        var tmp = items[index];
        items[index] = items[i];
        items[i] = tmp;
        permute(items, index + 1);
        items[i] = items[index];
        items[index] = tmp;
      }
    }
  }

  function buildCycle(order) {
    var cycle = [];
    for (var i = 0; i < order.length; i++) cycle.push([order[i], order[(i + 1) % order.length]]);
    return cycle;
  }

  function scoreSkippedCycle(cycle) {
    return cycle.reduce(function (score, pair) {
      var homeReturning = isReturningTeam(pair[0]);
      var awayReturning = isReturningTeam(pair[1]);
      if (homeReturning && awayReturning) return score + 10;
      if (homeReturning || awayReturning) return score + 2;
      return score;
    }, 0);
  }

  function isReturningTeam(team) {
    if (!team) return false;
    var parentId = String(team.parentTeamId || '').trim();
    if (parentId && seasonOneTeams.some(function (t) { return String(t.id || '').trim() === parentId; })) return true;
    var nameKey = normalizeTeamName(team.name);
    return !!nameKey && seasonOneTeams.some(function (t) { return normalizeTeamName(t.name) === nameKey; });
  }

  function normalizeTeamName(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function generateGreedyDivisionPairs(group, division, targetGames) {
    var counts = {};
    var matchups = [];
    group.forEach(function (team) { counts[team.id] = 0; });
    for (var i = 0; i < group.length; i++) {
      for (var j = i + 1; j < group.length; j++) {
        if (counts[group[i].id] < targetGames && counts[group[j].id] < targetGames) {
          matchups.push(makeMatchup(group[i], group[j], division));
          counts[group[i].id]++;
          counts[group[j].id]++;
        }
      }
    }
    return matchups;
  }

  function makeMatchup(home, away, division) {
    return {
      round: 0,
      division: division || '',
      homeId: home.id,
      awayId: away.id,
      homeName: home.name,
      awayName: away.name,
      date: '',
      time: '',
      venue: ''
    };
  }

  function pairKey(a, b) {
    return [a, b].sort().join('_');
  }

  function validateSeason2Matchups(matchups) {
    var teamById = {}, counts = {}, divisionCounts = {};
    teams.forEach(function (team) {
      teamById[team.id] = team; counts[team.id] = 0;
      var division = normalizeDivision(team); divisionCounts[division] = (divisionCounts[division] || 0) + 1;
    });
    if (teams.length !== 16 || divisionCounts.CLUTCH !== 8 || divisionCounts.FASTBREAK !== 8) {
      var divisionSummary = Object.keys(divisionCounts).sort().map(function (key) {
        return key + '=' + divisionCounts[key];
      }).join('、') || '沒有分組資料';
      var unexpectedTeams = teams.filter(function (team) {
        var division = normalizeDivision(team);
        return division !== 'CLUTCH' && division !== 'FASTBREAK';
      }).map(function (team) {
        return (team.name || team.id || '未命名球隊') + '（division=' + JSON.stringify(String(team.division || '')) + '）';
      });
      return 'Season 2 必須為 Clutch 及 Fastbreak 各 8 隊。實收：共 ' + teams.length + ' 隊（' + divisionSummary + '）。' +
        (unexpectedTeams.length ? '異常分組球隊：' + unexpectedTeams.join('、') + '。' : '');
    }
    if ((matchups || []).length !== 40) return '現有及新增賽事合共必須為 40 場。';
    for (var i = 0; i < matchups.length; i++) {
      var match = matchups[i];
      var home = teamById[match.homeId], away = teamById[match.awayId];
      if (!home || !away || home.id === away.id) return '賽程包含無效球隊對陣。';
      counts[home.id]++; counts[away.id]++;
    }
    var invalidTeam = Object.keys(counts).filter(function (teamId) { return counts[teamId] !== SEASON2_TARGET_GAMES; })[0];
    return invalidTeam ? '每隊的已完成、已安排及新增賽事合共必須正好 5 場。' : '';
  }

  function compareTeamName(a, b) {
    return (a.name || '').localeCompare(b.name || '');
  }

  function normalizeDivisionValue(value) {
    var normalized = String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
    normalized = normalized.replace(/^DIVISION/, '').replace(/DIVISION$/, '');
    return normalized || 'UNASSIGNED';
  }

  function normalizeDivision(team) {
    return normalizeDivisionValue(team && team.division);
  }

  function showRoundRobinPanel() {
    syncRRInputs();
    var drafts = rrMatchups.length ? rrMatchups.slice() : (loadRRState() || []);
    showMsg('正在讀取現有賽事並生成餘下賽程…', 'info');
    rrBtn.disabled = true;
    refreshScheduleFromBackend(drafts, true).then(function () {
      var validationError = validateSeason2Matchups(rrMatchups);
      if (validationError) {
        showMsg(validationError + ' 所有已完成及已安排賽事均已保留。', 'error');
        return;
      }
      showMsg('賽程已生成：現有已完成及已安排賽事已保留，只加入餘下賽事。', 'success');
      rrPanel.scrollIntoView({ behavior: 'smooth' });
    }).catch(function (err) {
      blockRRUntilReload();
      showMsg(err.message || I18n.t('error.loadFailed'), 'error');
    }).finally(function () {
      rrBtn.disabled = false;
    });
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
    var currentKey = '';

    rrMatchups.forEach(function (m, idx) {
      // Round header
      var groupKey = (m.division || '') + ':' + m.round;
      if (groupKey !== currentKey) {
        currentKey = groupKey;
        var header = document.createElement('div');
        header.className = 'rr-round-header';
        header.textContent = (m.division ? (formatDivisionName(m.division) + ' - ') : '') + I18n.t('admin.rrRound') + ' ' + m.round;
        rrMatchupsEl.appendChild(header);
      }

      var row = document.createElement('div');
      row.className = 'rr-match-row';
      row.setAttribute('data-idx', idx);

      // Home team select
      var homeSelHtml = buildTeamSelectHtml('rr-home-' + idx, m.homeId, m.division);
      // Away team select
      var awaySelHtml = buildTeamSelectHtml('rr-away-' + idx, m.awayId, m.division);

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

  function buildTeamSelectHtml(id, selectedId, division) {
    var html = '<select id="' + id + '" class="admin-select rr-team-select" disabled title="Season 2 固定賽程不可交換球隊">';
    getTeamsForDivision(division).forEach(function (t) {
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
  // Team Swap — regenerate remaining matchups to match the selected division format
  // ============================================================

  /**
   * When admin changes a team in a matchup, we need to:
   * 1. Update that specific matchup
  * 2. Regenerate all unpublished matchups so each team plays every team in its division once
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

    var targetDivision = m.division || '';
    var otherDivisionMatchups = [];

    // Collect locked (published) matchups for this division only
    var locked = [];
    var unlocked = [];
    rrMatchups.forEach(function (match, i) {
      if ((match.division || '') !== targetDivision) {
        otherDivisionMatchups.push(match);
      } else if (match.published) {
        locked.push(match);
      } else if (i === changedIdx) {
        locked.push(match); // treat the just-changed one as locked too
      } else {
        unlocked.push(match);
      }
    });

    // Count games per team from locked matchups
    var gameCount = {};
    var eligibleTeams = getTeamsForDivision(m.division);
    eligibleTeams.forEach(function (t) { gameCount[t.id] = 0; });
    var playedPairs = {};
    locked.forEach(function (match) {
      gameCount[match.homeId] = (gameCount[match.homeId] || 0) + 1;
      gameCount[match.awayId] = (gameCount[match.awayId] || 0) + 1;
      var pairKey = [match.homeId, match.awayId].sort().join('_');
      playedPairs[pairKey] = true;
    });

    var maxGames = Math.min(SEASON2_TARGET_GAMES, Math.max(0, eligibleTeams.length - 1));

    // Generate all possible remaining pairs that haven't been played
    var neededPairs = [];
    for (var i = 0; i < eligibleTeams.length; i++) {
      for (var j = i + 1; j < eligibleTeams.length; j++) {
        var pKey = [eligibleTeams[i].id, eligibleTeams[j].id].sort().join('_');
        if (!playedPairs[pKey] && gameCount[eligibleTeams[i].id] < maxGames && gameCount[eligibleTeams[j].id] < maxGames) {
          neededPairs.push({ homeId: eligibleTeams[i].id, awayId: eligibleTeams[j].id });
        }
      }
    }

    // Greedily assign pairs ensuring no team exceeds maxGames
    var newMatchups = [];
    var tempCount = {};
    eligibleTeams.forEach(function (t) { tempCount[t.id] = gameCount[t.id]; });

    neededPairs.forEach(function (pair) {
      if (tempCount[pair.homeId] < maxGames && tempCount[pair.awayId] < maxGames) {
        newMatchups.push({
          round: 0,
          division: m.division || '',
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
    rrMatchups = otherDivisionMatchups.concat(locked).concat(newMatchups);
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

  function getTeamById(teamId) {
    for (var i = 0; i < teams.length; i++) {
      if (teams[i].id === teamId) return teams[i];
    }
    return null;
  }

  function getMatchDivision(homeTeamId, awayTeamId) {
    var home = getTeamById(homeTeamId);
    var away = getTeamById(awayTeamId);
    var homeDivision = home ? normalizeDivision(home) : '';
    var awayDivision = away ? normalizeDivision(away) : '';
    if (homeDivision && awayDivision && homeDivision !== awayDivision) return 'Cross';
    return homeDivision || awayDivision || '';
  }

  function formatDivisionName(division) {
    var name = String(division || '').trim();
    if (name.toLowerCase() === 'cross') return 'Cross-Division';
    return /^division\b/i.test(name) ? name : 'Division ' + name;
  }

  function getTeamsForDivision(division) {
    if (!division) return teams;
    var normalized = normalizeDivisionValue(division);
    if (normalized === 'CROSS') return teams;
    return teams.filter(function (t) { return normalizeDivision(t) === normalized; });
  }

  function getDivisionCounts() {
    var counts = {};
    teams.forEach(function (t) {
      var division = normalizeDivision(t);
      counts[division] = (counts[division] || 0) + 1;
    });
    return counts;
  }

  // ============================================================
  // Publish matchups to the schedule (createGame API)
  // ============================================================

  function setRRPublishControlsDisabled(disabled) {
    rrMatchupsEl.querySelectorAll('.rr-publish-btn').forEach(function (button) {
      button.disabled = disabled;
    });
    if (disabled) rrPublishBtn.disabled = true;
    else updatePublishAllBtn();
  }

  function findRRMatchByPair(key) {
    for (var i = 0; i < rrMatchups.length; i++) {
      if (pairKey(rrMatchups[i].homeId, rrMatchups[i].awayId) === key) return rrMatchups[i];
    }
    return null;
  }

  function publishSingleMatch(idx) {
    var selected = rrMatchups[idx];
    if (!selected || selected.published) return;

    syncRRInputs();
    selected = rrMatchups[idx];
    if (!selected.date || !selected.venue) {
      showMsg(I18n.t('admin.rrNeedDateVenue'), 'error');
      return;
    }

    var drafts = rrMatchups.slice();
    var targetKey = pairKey(selected.homeId, selected.awayId);
    var outcomeMessage = '';
    var outcomeType = 'error';
    setRRPublishControlsDisabled(true);

    refreshScheduleFromBackend(drafts, true).then(function () {
      var validationError = validateSeason2Matchups(rrMatchups);
      if (validationError) throw new Error(validationError);
      var current = findRRMatchByPair(targetKey);
      if (!current) throw new Error('後端賽程已變更，此對賽已不再需要；請檢查最新賽程。');
      if (current.published) throw new Error('此對賽已經發佈，已重新載入最新賽程。');
      if (!current.date || !current.venue) throw new Error(I18n.t('admin.rrNeedDateVenue'));
      setRRPublishControlsDisabled(true);
      return API.post('createGame', {
        seasonId: seasonSelect.value,
        date: current.date,
        time: current.time,
        venue: current.venue,
        homeTeamId: current.homeId,
        awayTeamId: current.awayId,
        type: 'regular'
      });
    }).then(function () {
      outcomeMessage = I18n.t('admin.gameSaved');
      outcomeType = 'success';
    }).catch(function (err) {
      outcomeMessage = err.message || I18n.t('error.submitFailed');
      outcomeType = 'error';
    }).then(function () {
      return refreshScheduleFromBackend(drafts, true).catch(function (refreshErr) {
        blockRRUntilReload();
        outcomeMessage += '（重新載入失敗：' + (refreshErr.message || I18n.t('error.loadFailed')) + '；發佈已暫停）';
        outcomeType = 'error';
      });
    }).then(function () {
      showMsg(outcomeMessage, outcomeType);
    }).finally(function () {
      setRRPublishControlsDisabled(false);
    });
  }

  function handlePublishAll() {
    syncRRInputs();
    var drafts = rrMatchups.slice();
    var outcomeMessage = '';
    var outcomeType = 'error';
    var cancelled = false;
    setRRPublishControlsDisabled(true);

    refreshScheduleFromBackend(drafts, true).then(function () {
      var validationError = validateSeason2Matchups(rrMatchups);
      if (validationError) throw new Error(validationError);

      var toPublish = rrMatchups.filter(function (match) {
        return !match.published && match.date && match.venue;
      });
      if (!toPublish.length) throw new Error('沒有已填寫日期及場地的未發佈賽事。');
      if (!confirm(I18n.t('admin.rrPublishConfirm').replace('{count}', toPublish.length))) {
        cancelled = true;
        return [];
      }
      setRRPublishControlsDisabled(true);

      var results = [];
      var publishSequence = Promise.resolve();
      toPublish.forEach(function (match) {
        publishSequence = publishSequence.then(function () {
          return API.post('createGame', {
            seasonId: seasonSelect.value,
            date: match.date,
            time: match.time,
            venue: match.venue,
            homeTeamId: match.homeId,
            awayTeamId: match.awayId,
            type: 'regular'
          }).then(function () {
            results.push({ ok: true });
          }, function (err) {
            results.push({ ok: false, error: err });
          });
        });
      });

      return publishSequence.then(function () {
        var succeeded = results.filter(function (result) { return result.ok; }).length;
        var failed = results.length - succeeded;
        if (failed) {
          var firstFailure = results.filter(function (result) { return !result.ok; })[0];
          outcomeMessage = '已發佈 ' + succeeded + ' 場，' + failed + ' 場失敗：' +
            ((firstFailure.error && firstFailure.error.message) || I18n.t('error.submitFailed'));
          outcomeType = 'error';
        } else {
          outcomeMessage = I18n.t('admin.rrPublished').replace('{count}', succeeded);
          outcomeType = 'success';
        }
        return results;
      });
    }).catch(function (err) {
      outcomeMessage = err.message || I18n.t('error.submitFailed');
      outcomeType = 'error';
    }).then(function () {
      return refreshScheduleFromBackend(drafts, true).catch(function (refreshErr) {
        blockRRUntilReload();
        if (!cancelled) {
          outcomeMessage += '（重新載入失敗：' + (refreshErr.message || I18n.t('error.loadFailed')) + '；發佈已暫停）';
          outcomeType = 'error';
        }
      });
    }).then(function () {
      if (!cancelled && outcomeMessage) showMsg(outcomeMessage, outcomeType);
    }).finally(function () {
      setRRPublishControlsDisabled(false);
    });
  }

  // ============================================================
  // Season 2 playoff / consolation bracket graph
  // ============================================================

  function renderPlayoffGraph(standings, playoffData) {
    var stored = {};
    ((playoffData && playoffData.brackets) || []).forEach(function (bracket) {
      stored[bracket.id] = bracket;
    });
    var seasonOne = isCurrentSeasonOne();
    if (seasonOne && !stored.champions && playoffData && playoffData.rounds && playoffData.rounds.length) {
      stored.champions = { id: 'champions', name: '🏆 冠軍組', rounds: playoffData.rounds };
    }
    var hasStoredGames = ['champions', 'consolation'].some(function (id) {
      return stored[id] && stored[id].rounds && stored[id].rounds.some(function (round) {
        return round.games && round.games.length;
      });
    });
    var preview = seasonOne ? null : buildPlayoffPreview(standings || []);

    playoffPanel.hidden = false;
    playoffStatusEl.textContent = hasStoredGames
      ? '已發佈的季後賽對陣；可在上方賽程列表按「編輯」設定組別及階段。'
      : (seasonOne ? 'Season 1 請使用「建立比賽」，選擇季後賽、組別及準決賽／決賽。' : '根據目前分組排名預覽；按「一鍵生成季後賽」發佈 8 場首輪比賽。');

    if (!hasStoredGames && !preview) {
      playoffBracketsEl.innerHTML = '<div class="admin-bracket-empty">暫未建立季後賽；請按「建立比賽」設定冠軍組或安慰賽。</div>';
      return;
    }

    var championsTitle = seasonOne ? '🏆 冠軍組' : '🏆 季後賽（排名 1–4）';
    var consolationTitle = seasonOne ? '🥈 安慰賽／排名組' : '🥈 安慰賽（排名 5–8）';
    playoffBracketsEl.innerHTML =
      renderAdminBracket('champions', championsTitle, stored.champions, preview && preview.champions) +
      renderAdminBracket('consolation', consolationTitle, stored.consolation, preview && preview.consolation);
  }

  function buildPlayoffPreview(standings) {
    var divisions = {};
    standings.forEach(function (team) {
      var key = normalizeDivision(team);
      if (!divisions[key]) divisions[key] = [];
      divisions[key].push(team);
    });
    var keys = Object.keys(divisions);
    var clutchKey = keys.indexOf('CLUTCH') !== -1 ? 'CLUTCH' : '';
    var fastbreakKey = keys.indexOf('FASTBREAK') !== -1 ? 'FASTBREAK' : '';
    if (!clutchKey || !fastbreakKey || divisions[clutchKey].length < 8 || divisions[fastbreakKey].length < 8) return null;

    var clutch = divisions[clutchKey];
    var fastbreak = divisions[fastbreakKey];
    function game(home, away, homeRank, awayRank) {
      return {
        homeTeamName: home.teamName,
        awayTeamName: away.teamName,
        homeScore: null,
        awayScore: null,
        label: 'Clutch #' + homeRank + ' vs Fastbreak #' + awayRank
      };
    }
    return {
      champions: [
        game(clutch[0], fastbreak[3], 1, 4),
        game(clutch[2], fastbreak[1], 3, 2),
        game(clutch[1], fastbreak[2], 2, 3),
        game(clutch[3], fastbreak[0], 4, 1)
      ],
      consolation: [
        game(clutch[4], fastbreak[7], 5, 8),
        game(clutch[6], fastbreak[5], 7, 6),
        game(clutch[5], fastbreak[6], 6, 7),
        game(clutch[7], fastbreak[4], 8, 5)
      ]
    };
  }

  function renderAdminBracket(id, title, storedBracket, previewGames) {
    var rounds = (storedBracket && storedBracket.rounds) || [];
    function gamesForRound(roundNumber, fallbackIndex) {
      var match = rounds.filter(function (round) { return Number(round.round) === roundNumber; })[0] || rounds[fallbackIndex];
      return match && match.games && match.games.length ? match.games : [];
    }

    if (isCurrentSeasonOne()) {
      var semifinalFallback = id === 'champions'
        ? [placeholderGame('冠軍組準決賽勝方待定', '對手待定'), placeholderGame('冠軍組準決賽勝方待定', '對手待定')]
        : [placeholderGame('排名組準決賽隊伍待定', '對手待定'), placeholderGame('排名組準決賽隊伍待定', '對手待定')];
      var semifinalsS1 = gamesForRound(1, 0);
      if (!semifinalsS1.length) semifinalsS1 = semifinalFallback;
      var finalsS1 = gamesForRound(2, 1);
      if (!finalsS1.length) finalsS1 = [placeholderGame('準決賽勝方 1', '準決賽勝方 2')];
      return '<section class="admin-bracket admin-bracket--' + id + '">' +
        '<h3 class="admin-bracket-title">' + title + '</h3>' +
        '<div class="admin-bracket-grid admin-bracket-grid--season1">' +
          renderAdminRound(id === 'champions' ? '準決賽' : '排名準決賽', semifinalsS1) +
          renderAdminRound(id === 'champions' ? '冠軍賽' : '安慰賽決賽', finalsS1) +
        '</div>' +
      '</section>';
    }

    var quarterfinals = gamesForRound(1, 0);
    if (!quarterfinals.length) quarterfinals = previewGames || [];
    var semifinalPlaceholders = id === 'champions'
      ? [placeholderGame('第1場勝方', '第3場勝方'), placeholderGame('第2場勝方', '第4場勝方')]
      : [placeholderGame('第5場勝方', '第7場勝方'), placeholderGame('第6場勝方', '第8場勝方')];
    var semifinals = gamesForRound(2, 1);
    if (!semifinals.length) semifinals = semifinalPlaceholders;
    var finals = gamesForRound(3, 2);
    if (!finals.length) finals = [placeholderGame('準決賽勝方 1', '準決賽勝方 2')];

    return '<section class="admin-bracket admin-bracket--' + id + '">' +
      '<h3 class="admin-bracket-title">' + title + '</h3>' +
      '<div class="admin-bracket-grid">' +
        renderAdminRound('首輪', quarterfinals) +
        renderAdminRound('準決賽', semifinals) +
        renderAdminRound('決賽', finals) +
      '</div>' +
    '</section>';
  }

  function placeholderGame(home, away) {
    return { homeTeamName: home, awayTeamName: away, homeScore: null, awayScore: null, placeholder: true, label: '待定' };
  }

  function renderAdminRound(title, games) {
    var html = '<div class="admin-bracket-round"><div class="admin-bracket-round-title">' + title + '</div><div class="admin-bracket-games">';
    (games || []).forEach(function (game) {
      var placeholderClass = game.placeholder ? ' admin-bracket-team--placeholder' : '';
      var scheduleDetails = [];
      if (game.date) scheduleDetails.push(Utils.formatDateWithDay(game.date));
      if (game.time) scheduleDetails.push(Utils.formatTime(game.time));
      if (game.venue) scheduleDetails.push(game.venue);
      html += '<div class="admin-bracket-game">' +
        '<div class="admin-bracket-label">' + esc(game.label || '') + '</div>' +
        (scheduleDetails.length ? '<div class="admin-bracket-schedule">' + esc(scheduleDetails.join(' · ')) + '</div>' : '') +
        '<div class="admin-bracket-team' + placeholderClass + '"><span>' + esc(game.homeTeamName || '待定') + '</span><strong>' + formatBracketScore(game.homeScore) + '</strong></div>' +
        '<div class="admin-bracket-team' + placeholderClass + '"><span>' + esc(game.awayTeamName || '待定') + '</span><strong>' + formatBracketScore(game.awayScore) + '</strong></div>' +
      '</div>';
    });
    return html + '</div></div>';
  }

  function formatBracketScore(score) {
    return score === null || score === undefined || score === '' ? '–' : esc(String(score));
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
