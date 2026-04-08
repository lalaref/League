/**
 * ALL-IN Basketball League — Box Score 輸入介面
 * 需求：7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.6
 */
(function () {
  'use strict';

  var STAT_FIELDS = ['pts','reb','ast','stl','blk','fgm','fga','tpm','tpa','ftm','fta','to','fouls'];
  var seasonSelect = document.getElementById('season-select');
  var gameSelect = document.getElementById('game-select');
  var messageEl = document.getElementById('boxscore-message');
  var desktopWrapper = document.getElementById('boxscore-desktop');
  var mobileWrapper = document.getElementById('boxscore-mobile');
  var actionsEl = document.getElementById('boxscore-actions');
  var submitBtn = document.getElementById('btn-submit-boxscore');
  var updateBtn = document.getElementById('btn-update-boxscore');
  var swipeHint = document.getElementById('swipe-hint');
  var playerIndicator = document.getElementById('player-indicator');
  var boxscoreBody = document.getElementById('boxscore-body');

  var currentGame = null;
  var allPlayers = [];
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

  function loadSeasons() {
    API.getSeasons().then(function (seasons) {
      seasonSelect.innerHTML = '<option value="">--</option>';
      (seasons || []).forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.name;
        seasonSelect.appendChild(o);
      });
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
        o.textContent = g.date + ' — ' + (g.homeTeamName || g.homeTeamId) + ' vs ' + (g.awayTeamName || g.awayTeamId) + (g.status === 'completed' ? ' ✓' : '');
        gameSelect.appendChild(o);
      });
    }).catch(function () { showMessage(I18n.t('error.loadFailed'), 'error'); });
  }

  function loadGameRosters(gameId) {
    showMessage(I18n.t('common.loading'), 'info');
    Promise.all([API.getBoxScore(gameId), API.getGames(seasonSelect.value)]).then(function (r) {
      var boxData = r[0]; var games = r[1] || [];
      currentGame = games.find(function (g) { return g.id === gameId; }) || null;
      if (boxData && (boxData.homeStats || boxData.awayStats)) {
        existingBoxScore = boxData; buildFromExisting(boxData);
      } else { existingBoxScore = null; loadTeamPlayers(); }
    }).catch(function () { existingBoxScore = null; loadTeamPlayers(); });
  }

  function loadTeamPlayers() {
    if (!currentGame) { showMessage(I18n.t('admin.noGameSelected'), 'error'); return; }
    Promise.all([API.getPlayers(currentGame.homeTeamId), API.getPlayers(currentGame.awayTeamId)]).then(function (r) {
      var hp = (r[0]||[]).map(function(p){ return Object.assign({},p,{teamId:currentGame.homeTeamId,teamName:currentGame.homeTeamName||currentGame.homeTeamId,side:'home'}); });
      var ap = (r[1]||[]).map(function(p){ return Object.assign({},p,{teamId:currentGame.awayTeamId,teamName:currentGame.awayTeamName||currentGame.awayTeamId,side:'away'}); });
      allPlayers = hp.concat(ap); renderBoxScore(); hideMessage();
    }).catch(function () { showMessage(I18n.t('error.loadFailed'), 'error'); });
  }

  function buildFromExisting(boxData) {
    allPlayers = [];
    var map = function (stats, side) {
      return (stats||[]).map(function(s){ return {id:s.playerId,name:s.playerName||s.playerId,number:s.number||'',teamId:s.teamId,teamName:s.teamName||s.teamId,side:side,stats:s}; });
    };
    allPlayers = map(boxData.homeStats,'home').concat(map(boxData.awayStats,'away'));
    renderBoxScore(); submitBtn.hidden = true; updateBtn.hidden = false; hideMessage();
  }


  function renderBoxScore() {
    renderDesktopTable(); renderMobileCards();
    desktopWrapper.hidden = false; mobileWrapper.hidden = false; actionsEl.hidden = false;
    if (!existingBoxScore) { submitBtn.hidden = false; updateBtn.hidden = true; }
    updateSwipeHint();
  }

  function renderDesktopTable() {
    boxscoreBody.innerHTML = '';
    var curSide = '';
    allPlayers.forEach(function (p, idx) {
      if (p.side !== curSide) {
        curSide = p.side;
        var hr = document.createElement('tr'); hr.className = 'admin-team-header-row';
        var hc = document.createElement('td'); hc.colSpan = STAT_FIELDS.length + 1;
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
        if (p.stats && p.stats[f] !== undefined) inp.value = p.stats[f];
        td.appendChild(inp);
        var err = document.createElement('span'); err.className = 'admin-field-error';
        err.id = 'err-' + idx + '-' + f; err.setAttribute('role','alert'); err.hidden = true;
        td.appendChild(err); tr.appendChild(td);
      });
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
        if (p.stats && p.stats[f] !== undefined) inp.value = p.stats[f];
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
      if (raw === '') { showFieldError(idx, f, I18n.t('error.requiredField',{field:f.toUpperCase()})); errors.push({idx:idx,field:f}); return; }
      var num = Number(raw);
      if (!Number.isInteger(num)) { showFieldError(idx, f, I18n.t('error.notInteger',{field:f.toUpperCase()})); errors.push({idx:idx,field:f}); return; }
      if (num < 0) { showFieldError(idx, f, I18n.t('error.negativeNumber',{field:f.toUpperCase()})); errors.push({idx:idx,field:f}); return; }
      vals[f] = num;
    });
    if (vals.fgm !== undefined && vals.fga !== undefined && vals.fgm > vals.fga) {
      showFieldError(idx,'fgm',I18n.t('error.fgmExceedsFga')); errors.push({idx:idx,field:'fgm'});
    }
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

  function handleSubmit() {
    var errors = validateAll();
    if (errors.length > 0) { showMessage(I18n.t('error.invalidData'), 'error'); return; }
    submitBtn.disabled = true;
    API.submitBoxScore(gameSelect.value, collectEntries()).then(function () {
      showMessage(I18n.t('admin.submitSuccess'), 'success');
      submitBtn.hidden = true; updateBtn.hidden = false; existingBoxScore = true;
    }).catch(function (err) {
      showMessage(err.message || I18n.t('error.submitFailed'), 'error');
    }).finally(function(){ submitBtn.disabled = false; });
  }

  function handleUpdate() {
    var errors = validateAll();
    if (errors.length > 0) { showMessage(I18n.t('error.invalidData'), 'error'); return; }
    updateBtn.disabled = true;
    API.submitBoxScore(gameSelect.value, collectEntries()).then(function () {
      showMessage(I18n.t('admin.updateSuccess'), 'success');
    }).catch(function (err) {
      showMessage(err.message || I18n.t('error.submitFailed'), 'error');
    }).finally(function(){ updateBtn.disabled = false; });
  }

  // --- Helpers ---
  function hideBoxScore() {
    desktopWrapper.hidden = true; mobileWrapper.hidden = true; actionsEl.hidden = true; swipeHint.hidden = true;
    allPlayers = []; currentGame = null; existingBoxScore = null;
  }

  function showMessage(text, type) {
    messageEl.textContent = text; messageEl.hidden = false;
    messageEl.className = 'admin-message admin-message--' + (type||'info');
  }
  function hideMessage() { messageEl.hidden = true; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  window.addEventListener('resize', updateSwipeHint);
})();
