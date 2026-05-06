/**
 * ALL-IN Basketball League — Box Score 輸入介面
 * 需求：7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.6
 * 功能：出席球員選擇、OREB/DREB 分開輸入、Q1-Q4 節分
 */
(function () {
  'use strict';

  // Keep UI order aligned with scorer workflow.
  // Note: fgm now included — must match table header order in boxscore.html
  var STAT_FIELDS = ['fouls','pts','fgm','fga','tpm','tpa','ftm','fta','oreb','dreb','ast','stl','blk','to'];
  var seasonSelect = document.getElementById('season-select');
  var gameSelect = document.getElementById('game-select');
  var messageEl = document.getElementById('boxscore-message');
  var desktopWrapper = document.getElementById('boxscore-desktop');
  var mobileWrapper = document.getElementById('boxscore-mobile');
  var actionsEl = document.getElementById('boxscore-actions');
  var submitBtn = document.getElementById('btn-submit-boxscore');
  var updateBtn = document.getElementById('btn-update-boxscore');
  var mvpSelectEl = document.getElementById('mvp-select');
  var swipeHint = document.getElementById('swipe-hint');
  var playerIndicator = document.getElementById('player-indicator');
  var boxscoreBody = document.getElementById('boxscore-body');
  var attendanceSection = document.getElementById('attendance-section');
  var attendanceHome = document.getElementById('attendance-home');
  var attendanceAway = document.getElementById('attendance-away');
  var confirmAttendanceBtn = document.getElementById('btn-confirm-attendance');
  var quarterSection = document.getElementById('quarter-scores-section');

  var currentGame = null;
  var allRosterPlayers = []; // all players from both teams
  var allPlayers = [];       // only attending players
  var existingBoxScore = null;
  var mobileCurrentIndex = 0;

  loadSeasons();
  seasonSelect.addEventListener('change', function () { loadGames(seasonSelect.value); });
  gameSelect.addEventListener('change', function () {
    if (gameSelect.value) loadGameRosters(gameSelect.value);
    else hideBoxScore();
  });
  submitBtn.addEventListener('click', handleSubmit);
  updateBtn.addEventListener('click', handleUpdate);
  if (mvpSelectEl) mvpSelectEl.addEventListener('change', updateMvpProfileLink);
  confirmAttendanceBtn.addEventListener('click', confirmAttendance);
  var addRosterBtn = document.getElementById('btn-add-roster-player');
  var addGuestBtn = document.getElementById('btn-add-guest-player');
  if (addRosterBtn) addRosterBtn.addEventListener('click', addRosterPlayer);
  if (addGuestBtn) addGuestBtn.addEventListener('click', addGuestPlayer);

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
      if (activeId) { seasonSelect.value = activeId; loadGames(activeId); }
    }).catch(function () { showMessage(I18n.t('error.loadFailed'), 'error'); });
  }

  function loadGames(seasonId) {
    if (!seasonId) {
      gameSelect.innerHTML = '<option value="">--</option>';
      gameSelect.disabled = true; hideBoxScore(); return;
    }
    API.getGames(seasonId).then(function (games) {
      gameSelect.innerHTML = '<option value="">--</option>';
      gameSelect.disabled = false;
      (games || []).forEach(function (g) {
        var o = document.createElement('option'); o.value = g.id;
        var dateStr = Utils.formatDateWithDay(g.date);
        var timeStr = Utils.formatTime(g.time);
        o.textContent = dateStr + (timeStr ? ' ' + timeStr : '') + ' — ' + (g.homeTeamName || g.homeTeamId) + ' vs ' + (g.awayTeamName || g.awayTeamId) + (g.status === 'completed' ? ' ✓' : '');
        gameSelect.appendChild(o);
      });
    }).catch(function () { showMessage(I18n.t('error.loadFailed'), 'error'); });
  }

  function loadGameRosters(gameId) {
    showMessage(I18n.t('common.loading'), 'info');
    var _boxData = null;
    Promise.all([
      API.getBoxScore(gameId),
      API.getGames(seasonSelect.value),
      API.getTeams(seasonSelect.value)
    ]).then(function (r) {
      _boxData = r[0]; var games = r[1] || []; var teams = r[2] || [];
      currentGame = games.find(function (g) { return g.id === gameId; }) || null;
      console.log('[BoxScore] currentGame:', JSON.stringify(currentGame));

      // Client-side team name resolution — always override from teams list
      if (currentGame && teams.length > 0) {
        var teamMap = {};
        teams.forEach(function (t) { teamMap[t.id] = t.name; });
        var resolvedHome = teamMap[currentGame.homeTeamId];
        var resolvedAway = teamMap[currentGame.awayTeamId];
        console.log('[BoxScore] resolved home=' + resolvedHome + ' away=' + resolvedAway);
        if (resolvedHome) currentGame.homeTeamName = resolvedHome;
        if (resolvedAway) currentGame.awayTeamName = resolvedAway;
      }
      if (!currentGame) return [[], []];
      return Promise.all([API.getPlayers(currentGame.homeTeamId), API.getPlayers(currentGame.awayTeamId)]);
    }).then(function (playerResults) {
      var rawHome = playerResults[0] || [];
      var rawAway = playerResults[1] || [];
      var homeId = currentGame ? currentGame.homeTeamId : '';
      var awayId = currentGame ? currentGame.awayTeamId : '';
      var homePlayers = rawHome.filter(function(p) { return p.teamId === homeId; });
      var awayPlayers = rawAway.filter(function(p) { return p.teamId === awayId; });
      console.log('[BoxScore] filtered home=' + homePlayers.length + ' away=' + awayPlayers.length);
      var seen = {};
      var dedup = function (arr) {
        return arr.filter(function (p) {
          if (seen[p.id]) return false;
          seen[p.id] = true;
          return true;
        });
      };
      var hp = dedup(homePlayers).map(function(p){ return Object.assign({},p,{teamId:homeId,teamName:currentGame.homeTeamName||homeId,side:'home'}); });
      var ap = dedup(awayPlayers).map(function(p){ return Object.assign({},p,{teamId:awayId,teamName:currentGame.awayTeamName||awayId,side:'away'}); });
      allRosterPlayers = hp.concat(ap);
      console.log('[BoxScore] allRosterPlayers count=' + allRosterPlayers.length);

      var hasExisting = _boxData && (
        (Array.isArray(_boxData.homeStats) && _boxData.homeStats.length > 0) ||
        (Array.isArray(_boxData.awayStats) && _boxData.awayStats.length > 0)
      );
      if (hasExisting) {
        existingBoxScore = _boxData; buildFromExisting(_boxData);
      } else {
        existingBoxScore = null;
        if (allRosterPlayers.length === 0) {
          showMessage('找不到球員資料。請先在球員管理頁面新增球員。', 'error'); return;
        }
        showAttendanceSelection();
      }
    }).catch(function () { existingBoxScore = null; showMessage(I18n.t('error.loadFailed'), 'error'); });
  }

  // loadTeamPlayers is superseded by the chained roster fetch inside loadGameRosters

  // --- Attendance Selection ---
  function showAttendanceSelection() {
    // Hide boxscore UI elements only (don't reset currentGame)
    desktopWrapper.hidden = true; mobileWrapper.hidden = true; actionsEl.hidden = true; swipeHint.hidden = true;
    quarterSection.hidden = true;
    attendanceHome.innerHTML = '';
    attendanceAway.innerHTML = '';
    var homeLabel = document.createElement('h4');
    homeLabel.textContent = (currentGame.homeTeamName || currentGame.homeTeamId) + ' (主隊)';
    attendanceHome.appendChild(homeLabel);
    var awayLabel = document.createElement('h4');
    awayLabel.textContent = (currentGame.awayTeamName || currentGame.awayTeamId) + ' (客隊)';
    attendanceAway.appendChild(awayLabel);

    allRosterPlayers.forEach(function (p, idx) {
      var container = p.side === 'home' ? attendanceHome : attendanceAway;
      var label = document.createElement('label');
      label.className = 'admin-attendance-item';
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true;
      cb.dataset.rosterIndex = idx;
      label.appendChild(cb);
      var span = document.createElement('span');
      span.textContent = ' #' + (p.number || '?') + ' ' + p.name;
      label.appendChild(span);
      container.appendChild(label);
    });

    attendanceSection.hidden = false;
    hideMessage();
  }

  function confirmAttendance() {
    var checkboxes = attendanceSection.querySelectorAll('input[type="checkbox"]');
    allPlayers = [];
    checkboxes.forEach(function (cb) {
      if (cb.checked) {
        var idx = parseInt(cb.dataset.rosterIndex, 10);
        allPlayers.push(allRosterPlayers[idx]);
      }
    });
    if (allPlayers.length === 0) {
      showMessage('請至少選擇一位出席球員', 'error'); return;
    }
    attendanceSection.hidden = true;
    showQuarterScores();
    populateMvpSelect();
    renderBoxScore();
    hideMessage();
  }

  function populateMvpSelect() {
    var mvpSelect = document.getElementById('mvp-select');
    var mvpSection = document.getElementById('mvp-section');
    if (!mvpSelect || !mvpSection) return;
    mvpSelect.innerHTML = '<option value="">-- 選擇 MVP --</option>';
    allPlayers.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = '#' + (p.number || '?') + ' ' + p.name + ' (' + (p.teamName || '') + ')';
      mvpSelect.appendChild(opt);
    });
    mvpSection.hidden = false;
    updateMvpProfileLink();
  }

  function updateMvpProfileLink() {
    var profileBox = document.getElementById('mvp-profile-box');
    var profileLink = document.getElementById('mvp-profile-link');
    if (!profileBox || !profileLink || !mvpSelectEl) return;

    var playerId = mvpSelectEl.value;
    if (!playerId) {
      profileBox.hidden = true;
      profileLink.removeAttribute('href');
      return;
    }

    var player = allPlayers.find(function (p) { return p.id === playerId; }) || null;
    var playerLabel = player ? ('#' + (player.number || '?') + ' ' + player.name) : playerId;

    profileLink.href = '../player.html?id=' + encodeURIComponent(playerId);
    profileLink.textContent = '查看球員檔案：' + playerLabel;
    profileBox.hidden = false;
  }

  function buildFromExisting(boxData) {
    allPlayers = [];
    var map = function (stats, side) {
      return (stats||[]).map(function(s){ return {id:s.playerId,name:s.playerName||s.playerId,number:s.number||'',teamId:s.teamId,teamName:s.teamName||s.teamId,side:side,stats:s}; });
    };
    allPlayers = map(boxData.homeStats,'home').concat(map(boxData.awayStats,'away'));
    // Load existing quarter scores
    var game = boxData.game || {};
    showQuarterScores();
    populateMvpSelect();
    // Set existing MVP
    if (game.mvpPlayerId) {
      var mvpSelect = document.getElementById('mvp-select');
      if (mvpSelect) mvpSelect.value = game.mvpPlayerId;
    }
    updateMvpProfileLink();
    ['homeQ1','homeQ2','homeQ3','homeQ4','awayQ1','awayQ2','awayQ3','awayQ4'].forEach(function(qf) {
      var el = document.getElementById('qs-' + qf);
      if (el && game[qf]) el.value = game[qf];
    });
    updateQuarterTotals();
    renderBoxScore(); submitBtn.hidden = true; updateBtn.hidden = false; hideMessage();
  }

  function showQuarterScores() {
    if (!currentGame) return;
    var homeLabel = document.getElementById('qs-home-label');
    var awayLabel = document.getElementById('qs-away-label');
    if (homeLabel) homeLabel.textContent = currentGame.homeTeamName || currentGame.homeTeamId || '主隊';
    if (awayLabel) awayLabel.textContent = currentGame.awayTeamName || currentGame.awayTeamId || '客隊';
    quarterSection.hidden = false;
    attachQuarterListeners();
  }

  function attachQuarterListeners() {
    ['homeQ1','homeQ2','homeQ3','homeQ4','awayQ1','awayQ2','awayQ3','awayQ4'].forEach(function(qf) {
      var el = document.getElementById('qs-' + qf);
      if (el) el.addEventListener('input', updateQuarterTotals);
    });
  }

  function updateQuarterTotals() {
    var homeTotal = 0, awayTotal = 0;
    ['homeQ1','homeQ2','homeQ3','homeQ4'].forEach(function(qf) {
      var el = document.getElementById('qs-' + qf);
      homeTotal += el ? (parseInt(el.value, 10) || 0) : 0;
    });
    ['awayQ1','awayQ2','awayQ3','awayQ4'].forEach(function(qf) {
      var el = document.getElementById('qs-' + qf);
      awayTotal += el ? (parseInt(el.value, 10) || 0) : 0;
    });
    var homeTotalEl = document.getElementById('qs-homeTotal');
    var awayTotalEl = document.getElementById('qs-awayTotal');
    if (homeTotalEl) homeTotalEl.value = homeTotal || '';
    if (awayTotalEl) awayTotalEl.value = awayTotal || '';
  }

  function renderBoxScore() {
    renderDesktopTable(); renderMobileCards();
    desktopWrapper.hidden = false; mobileWrapper.hidden = false; actionsEl.hidden = false;
    if (!existingBoxScore) { submitBtn.hidden = false; updateBtn.hidden = true; }
    updateSwipeHint();
    refreshAddPlayerDropdown();
  }

  function renderDesktopTable() {
    boxscoreBody.innerHTML = '';
    var curSide = '';
    allPlayers.forEach(function (p, idx) {
      if (p.side !== curSide) {
        curSide = p.side;
        var hr = document.createElement('tr'); hr.className = 'admin-team-header-row';
        var hc = document.createElement('td'); hc.colSpan = STAT_FIELDS.length + 2;
        hc.className = 'admin-team-header';
        hc.textContent = p.teamName + ' (' + I18n.t(p.side === 'home' ? 'admin.homeTeamPlayers' : 'admin.awayTeamPlayers') + ')';
        hr.appendChild(hc); boxscoreBody.appendChild(hr);
      }
      var tr = document.createElement('tr'); tr.dataset.playerIndex = idx;
      var nc = document.createElement('td'); nc.className = 'admin-player-name';
      nc.textContent = '#' + (p.number||'?') + ' ' + p.name; tr.appendChild(nc);
      STAT_FIELDS.forEach(function (f) {
        var td = document.createElement('td'); td.className = 'admin-input-cell';
        var inp = document.createElement('input');
        inp.type = 'text'; inp.inputMode = 'numeric'; inp.pattern = '[0-9]*';
        inp.className = 'admin-stat-input'; inp.dataset.playerIndex = idx; inp.dataset.field = f;
        inp.id = 'stat-' + idx + '-' + f;
        inp.setAttribute('aria-label', p.name + ' ' + f.toUpperCase());
        inp.placeholder = '0';
        if (p.stats && p.stats[f] !== undefined && p.stats[f] !== '' && p.stats[f] !== 0) inp.value = p.stats[f];
        td.appendChild(inp);
        var err = document.createElement('span'); err.className = 'admin-field-error';
        err.id = 'err-' + idx + '-' + f; err.setAttribute('role','alert'); err.hidden = true;
        td.appendChild(err); tr.appendChild(td);
      });
      // Remove button column
      var rtd = document.createElement('td'); rtd.className = 'admin-op-col';
      var rbtn = document.createElement('button');
      rbtn.className = 'admin-btn-remove'; rbtn.type = 'button';
      rbtn.setAttribute('aria-label', '移除 ' + p.name);
      rbtn.textContent = '✕';
      (function(i){ rbtn.addEventListener('click', function(){ removePlayer(i); }); })(idx);
      rtd.appendChild(rbtn); tr.appendChild(rtd);
      boxscoreBody.appendChild(tr);
    });
  }

  function renderMobileCards() {
    mobileWrapper.innerHTML = ''; mobileCurrentIndex = 0;
    allPlayers.forEach(function (p, idx) {
      var card = document.createElement('div');
      card.className = 'admin-player-card' + (idx === 0 ? ' active' : '');
      card.dataset.playerIndex = idx;
      var hdr = document.createElement('div'); hdr.className = 'admin-player-card-header';
      hdr.innerHTML = '<span class="admin-player-card-team">' + esc(p.teamName) + '</span>' +
        '<span class="admin-player-card-name">#' + esc(String(p.number||'?')) + ' ' + esc(p.name) + '</span>';
      var rbtn = document.createElement('button');
      rbtn.className = 'admin-btn-remove'; rbtn.type = 'button';
      rbtn.setAttribute('aria-label', '移除 ' + p.name);
      rbtn.textContent = '✕';
      (function(i){ rbtn.addEventListener('click', function(){ removePlayer(i); }); })(idx);
      hdr.appendChild(rbtn);
      card.appendChild(hdr);
      var grid = document.createElement('div'); grid.className = 'admin-stat-grid';
      STAT_FIELDS.forEach(function (f) {
        var item = document.createElement('div'); item.className = 'admin-stat-item';
        var lbl = document.createElement('label'); lbl.className = 'admin-stat-label';
        lbl.setAttribute('for','mob-'+idx+'-'+f); lbl.textContent = f.toUpperCase(); item.appendChild(lbl);
        var inp = document.createElement('input');
        inp.type = 'text'; inp.inputMode = 'numeric'; inp.pattern = '[0-9]*';
        inp.className = 'admin-stat-input'; inp.id = 'mob-'+idx+'-'+f;
        inp.dataset.playerIndex = idx; inp.dataset.field = f;
        inp.placeholder = '0';
        if (p.stats && p.stats[f] !== undefined && p.stats[f] !== '' && p.stats[f] !== 0) inp.value = p.stats[f];
        item.appendChild(inp);
        var err = document.createElement('span'); err.className = 'admin-field-error';
        err.id = 'mob-err-'+idx+'-'+f; err.setAttribute('role','alert'); err.hidden = true;
        item.appendChild(err); grid.appendChild(item);
      });
      card.appendChild(grid); mobileWrapper.appendChild(card);
    });
    setupSwipe();
  }

  function setupSwipe() {
    var startX = 0;
    mobileWrapper.addEventListener('touchstart', function(e){ startX = e.touches[0].clientX; }, {passive:true});
    mobileWrapper.addEventListener('touchend', function(e){
      var diff = e.changedTouches[0].clientX - startX;
      if (Math.abs(diff) > 50) {
        if (diff < 0 && mobileCurrentIndex < allPlayers.length - 1) showMobileCard(mobileCurrentIndex + 1);
        else if (diff > 0 && mobileCurrentIndex > 0) showMobileCard(mobileCurrentIndex - 1);
      }
    }, {passive:true});
  }

  function showMobileCard(index) {
    mobileWrapper.querySelectorAll('.admin-player-card').forEach(function(c,i){ c.classList.toggle('active', i===index); });
    mobileCurrentIndex = index; updateSwipeHint();
  }

  function updateSwipeHint() {
    if (allPlayers.length > 0 && window.innerWidth < 768) {
      swipeHint.hidden = false;
      playerIndicator.textContent = I18n.t('admin.playerOf', {current: mobileCurrentIndex+1, total: allPlayers.length});
    } else { swipeHint.hidden = true; }
  }

  // --- Validation ---
  function validateAll() {
    clearAllErrors(); var errors = [];
    allPlayers.forEach(function (p, idx) { errors = errors.concat(validatePlayer(idx)); });
    return errors;
  }

  function validatePlayer(idx) {
    var errors = [], vals = {};
    STAT_FIELDS.forEach(function (f) {
      var inp = getInput(idx, f); var raw = inp ? inp.value.trim() : '';
      if (raw === '') { vals[f] = 0; return; }
      var num = Number(raw);
      if (!Number.isInteger(num)) { showFieldError(idx, f, I18n.t('error.notInteger',{field:f.toUpperCase()})); errors.push({idx:idx,field:f}); return; }
      if (num < 0) { showFieldError(idx, f, I18n.t('error.negativeNumber',{field:f.toUpperCase()})); errors.push({idx:idx,field:f}); return; }
      vals[f] = num;
    });
    if (vals.tpm !== undefined && vals.tpa !== undefined && vals.tpm > vals.tpa) {
      showFieldError(idx,'tpm',I18n.t('error.tpmExceedsTpa')); errors.push({idx:idx,field:'tpm'});
    }
    if (vals.ftm !== undefined && vals.fta !== undefined && vals.ftm > vals.fta) {
      showFieldError(idx,'ftm',I18n.t('error.ftmExceedsFta')); errors.push({idx:idx,field:'ftm'});
    }
    return errors;
  }

  function getInput(idx, f) {
    return document.getElementById('stat-'+idx+'-'+f) || document.getElementById('mob-'+idx+'-'+f);
  }

  function showFieldError(idx, f, msg) {
    ['err-'+idx+'-'+f, 'mob-err-'+idx+'-'+f].forEach(function(id){
      var el = document.getElementById(id); if(el){el.textContent=msg;el.hidden=false;}
    });
    ['stat-'+idx+'-'+f, 'mob-'+idx+'-'+f].forEach(function(id){
      var el = document.getElementById(id); if(el) el.classList.add('admin-input-error');
    });
  }

  function clearAllErrors() {
    document.querySelectorAll('.admin-field-error').forEach(function(el){el.textContent='';el.hidden=true;});
    document.querySelectorAll('.admin-input-error').forEach(function(el){el.classList.remove('admin-input-error');});
  }

  // --- Submit / Update ---
  function collectEntries() {
    return allPlayers.map(function (p, idx) {
      var entry = {playerId: p.id, teamId: p.teamId};
      STAT_FIELDS.forEach(function(f){ var inp = getInput(idx,f); entry[f] = parseInt(inp.value,10)||0; });
      return entry;
    });
  }

  function collectQuarterScores() {
    var qs = {};
    ['homeQ1','homeQ2','homeQ3','homeQ4','awayQ1','awayQ2','awayQ3','awayQ4'].forEach(function(qf) {
      var el = document.getElementById('qs-' + qf);
      qs[qf] = el ? (parseInt(el.value, 10) || 0) : 0;
    });
    qs.homeScore = qs.homeQ1 + qs.homeQ2 + qs.homeQ3 + qs.homeQ4;
    qs.awayScore = qs.awayQ1 + qs.awayQ2 + qs.awayQ3 + qs.awayQ4;
    return qs;
  }

  function handleSubmit() {
    var errors = validateAll();
    if (errors.length > 0) { showMessage(I18n.t('error.invalidData'), 'error'); return; }
    submitBtn.disabled = true;
    var mvpSelect = document.getElementById('mvp-select');
    var mvpPlayerId = mvpSelect ? mvpSelect.value : '';
    var payload = Object.assign({ gameId: gameSelect.value, seasonId: seasonSelect.value, entries: collectEntries(), mvpPlayerId: mvpPlayerId }, collectQuarterScores());
    API.post('submitBoxScore', payload).then(function () {
      showMessage(I18n.t('admin.submitSuccess'), 'success');
      submitBtn.hidden = true; updateBtn.hidden = false; existingBoxScore = true;
    }).catch(function (err) {
      if (err.message === '請求超時') {
        // Timeout does NOT mean failure — GAS may have already written the data.
        // Show warning and switch to Update mode to prevent duplicate submission.
        showMessage('⚠️ 請求逾時，但資料可能已成功儲存。請重新載入頁面確認，或使用「更新 Box Score」按鈕修正數據，切勿重新點擊提交。', 'error');
        submitBtn.hidden = true; updateBtn.hidden = false; existingBoxScore = true;
      } else {
        showMessage(err.message || I18n.t('error.submitFailed'), 'error');
        submitBtn.disabled = false;
      }
    });
  }

  function handleUpdate() {
    var errors = validateAll();
    if (errors.length > 0) { showMessage(I18n.t('error.invalidData'), 'error'); return; }
    updateBtn.disabled = true;
    var mvpSelect = document.getElementById('mvp-select');
    var mvpPlayerId = mvpSelect ? mvpSelect.value : '';
    var payload = Object.assign({ gameId: gameSelect.value, seasonId: seasonSelect.value, entries: collectEntries(), mvpPlayerId: mvpPlayerId }, collectQuarterScores());
    API.post('submitBoxScore', payload).then(function () {
      showMessage(I18n.t('admin.updateSuccess'), 'success');
    }).catch(function (err) {
      showMessage(err.message || I18n.t('error.submitFailed'), 'error');
    }).finally(function(){ updateBtn.disabled = false; });
  }

  // --- Helpers ---
  function hideBoxScore() {
    desktopWrapper.hidden = true; mobileWrapper.hidden = true; actionsEl.hidden = true; swipeHint.hidden = true;
    quarterSection.hidden = true; attendanceSection.hidden = true;
    var mvpSection = document.getElementById('mvp-section');
    if (mvpSection) mvpSection.hidden = true;
    var profileBox = document.getElementById('mvp-profile-box');
    if (profileBox) profileBox.hidden = true;
    var playerMgmtSection = document.getElementById('player-mgmt-section');
    if (playerMgmtSection) playerMgmtSection.hidden = true;
    allPlayers = []; currentGame = null; existingBoxScore = null;
  }

  // --- Player Management ---
  function removePlayer(idx) {
    if (mobileCurrentIndex >= allPlayers.length - 1) mobileCurrentIndex = Math.max(0, allPlayers.length - 2);
    allPlayers.splice(idx, 1);
    renderBoxScore();
    populateMvpSelect();
  }

  function refreshAddPlayerDropdown() {
    var sel = document.getElementById('add-player-select');
    var playerMgmtSection = document.getElementById('player-mgmt-section');
    if (!sel) return;
    var activeIds = {};
    allPlayers.forEach(function(p) { if (p.id) activeIds[p.id] = true; });
    sel.innerHTML = '<option value="">-- \u5f9e\u540d\u55ae\u52a0\u5165\u7403\u54e1 --</option>';
    allRosterPlayers.forEach(function(p) {
      if (activeIds[p.id]) return;
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = (p.side === 'home' ? '\u4e3b\u968a ' : '\u5ba2\u968a ') + '#' + (p.number||'?') + ' ' + p.name;
      sel.appendChild(opt);
    });
    if (playerMgmtSection) playerMgmtSection.hidden = false;
  }

  function addRosterPlayer() {
    var sel = document.getElementById('add-player-select');
    if (!sel || !sel.value) return;
    var player = allRosterPlayers.find(function(p) { return p.id === sel.value; });
    if (!player) return;
    _insertPlayer(player);
    renderBoxScore();
    populateMvpSelect();
  }

  function addGuestPlayer() {
    if (!currentGame) return;
    var sideEl = document.getElementById('guest-side');
    var numEl = document.getElementById('guest-number');
    var nameEl = document.getElementById('guest-name');
    if (!sideEl || !numEl || !nameEl) return;
    var name = nameEl.value.trim();
    if (!name) { showMessage('\u8acb\u8f38\u5165\u7403\u54e1\u540d\u7a31', 'error'); return; }
    var side = sideEl.value;
    var guest = {
      id: 'guest-' + Date.now(),
      name: name,
      number: numEl.value.trim(),
      teamId: side === 'home' ? currentGame.homeTeamId : currentGame.awayTeamId,
      teamName: side === 'home' ? (currentGame.homeTeamName || '\u4e3b\u968a') : (currentGame.awayTeamName || '\u5ba2\u968a'),
      side: side,
      isGuest: true
    };
    numEl.value = ''; nameEl.value = '';
    _insertPlayer(guest);
    renderBoxScore();
    populateMvpSelect();
  }

  function _insertPlayer(player) {
    if (player.side === 'home') {
      var lastHomeIdx = -1;
      allPlayers.forEach(function(p, i) { if (p.side === 'home') lastHomeIdx = i; });
      allPlayers.splice(lastHomeIdx + 1, 0, player);
    } else {
      allPlayers.push(player);
    }
  }

  function showMessage(text, type) {
    messageEl.textContent = text; messageEl.hidden = false;
    messageEl.className = 'admin-message admin-message--' + (type||'info');
  }
  function hideMessage() { messageEl.hidden = true; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  window.addEventListener('resize', updateSwipeHint);
})();
