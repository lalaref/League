/**
 * ALL-IN Basketball League — 球隊自助管理頁面
 * 球隊隊長透過 ?token=xxx 連結管理球隊資料及球員名單
 */
(function () {
  'use strict';

  var token = new URLSearchParams(window.location.search).get('token');
  var loadingEl = document.getElementById('loading-msg');
  var errorEl = document.getElementById('error-msg');
  var teamSection = document.getElementById('team-section');
  var teamMsg = document.getElementById('team-msg');
  var playersBody = document.getElementById('players-body');
  var playerForm = document.getElementById('player-form');
  var playerFormTitle = document.getElementById('player-form-title');

  var currentTeam = null;
  var currentPlayers = [];
  var editingPlayerId = null;

  if (!token) {
    showError('無效的連結，缺少球隊 token 參數。請聯絡聯賽管理員取得正確連結。');
    return;
  }

  loadTeamData();

  // --- Event Listeners ---
  document.getElementById('btn-save-team').addEventListener('click', saveTeam);
  document.getElementById('btn-add-player').addEventListener('click', function () {
    editingPlayerId = null;
    playerFormTitle.textContent = '新增球員';
    clearPlayerForm();
    playerForm.hidden = false;
  });
  document.getElementById('btn-cancel-player').addEventListener('click', function () {
    playerForm.hidden = true;
  });
  document.getElementById('btn-save-player').addEventListener('click', savePlayer);

  // Color picker sync
  document.getElementById('t-jersey-home-color').addEventListener('input', function () {
    document.getElementById('t-jersey-home').value = this.value;
  });
  document.getElementById('t-jersey-away-color').addEventListener('input', function () {
    document.getElementById('t-jersey-away').value = this.value;
  });

  function loadTeamData() {
    API.get('teamByToken', { token: token })
      .then(function (data) {
        loadingEl.hidden = true;
        currentTeam = data.team;
        currentPlayers = data.players || [];
        renderTeam();
        renderPlayers();
        teamSection.hidden = false;
      })
      .catch(function (err) {
        showError(err.message || '載入失敗，請確認連結是否正確。');
      });
  }

  function renderTeam() {
    document.getElementById('team-title').textContent = currentTeam.name + ' — 球隊管理';
    document.getElementById('t-name').value = currentTeam.name || '';
    document.getElementById('t-logo').value = currentTeam.logo || '';
    document.getElementById('t-captain').value = currentTeam.captain || '';
    document.getElementById('t-whatsapp').value = currentTeam.captainWhatsApp || '';
    document.getElementById('t-desc').value = currentTeam.description || '';
    document.getElementById('t-jersey-home').value = currentTeam.jerseyHome || '';
    document.getElementById('t-jersey-away').value = currentTeam.jerseyAway || '';
    // Try to set color picker from stored hex or leave default
    if (currentTeam.jerseyHome && currentTeam.jerseyHome.charAt(0) === '#') {
      document.getElementById('t-jersey-home-color').value = currentTeam.jerseyHome;
    }
    if (currentTeam.jerseyAway && currentTeam.jerseyAway.charAt(0) === '#') {
      document.getElementById('t-jersey-away-color').value = currentTeam.jerseyAway;
    }
  }

  function renderPlayers() {
    playersBody.innerHTML = '';
    if (currentPlayers.length === 0) {
      playersBody.innerHTML = '<tr><td colspan="5" class="text-muted">尚未新增球員</td></tr>';
      return;
    }
    currentPlayers.forEach(function (p) {
      var tr = document.createElement('tr');
      var photoHtml = p.photo ? '<img src="' + esc(p.photo) + '" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover">' : '-';
      tr.innerHTML =
        '<td>' + esc(p.number || '-') + '</td>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td>' + esc(p.position || '-') + '</td>' +
        '<td>' + photoHtml + '</td>' +
        '<td>' +
        '<button class="btn btn-sm btn-outline btn-edit-p" data-id="' + p.id + '">編輯</button> ' +
        '<button class="btn btn-sm btn-outline btn-del-p" data-id="' + p.id + '">刪除</button>' +
        '</td>';
      playersBody.appendChild(tr);
    });
    bindPlayerButtons();
  }

  function bindPlayerButtons() {
    playersBody.querySelectorAll('.btn-edit-p').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var p = currentPlayers.find(function (x) { return x.id === id; });
        if (!p) return;
        editingPlayerId = id;
        playerFormTitle.textContent = '編輯球員';
        document.getElementById('p-name').value = p.name || '';
        document.getElementById('p-number').value = p.number || '';
        document.getElementById('p-position').value = p.position || '';
        document.getElementById('p-photo').value = p.photo || '';
        playerForm.hidden = false;
      });
    });
    playersBody.querySelectorAll('.btn-del-p').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (!confirm('確定刪除此球員？')) return;
        API.post('publicDeletePlayer', { teamToken: token, playerId: id })
          .then(function () { showTeamMsg('球員已刪除', 'success'); loadTeamData(); })
          .catch(function (err) { showTeamMsg(err.message || '刪除失敗', 'error'); });
      });
    });
  }

  function saveTeam() {
    var data = {
      teamToken: token,
      name: document.getElementById('t-name').value.trim(),
      logo: document.getElementById('t-logo').value.trim(),
      captain: document.getElementById('t-captain').value.trim(),
      captainWhatsApp: document.getElementById('t-whatsapp').value.trim(),
      description: document.getElementById('t-desc').value.trim(),
      jerseyHome: document.getElementById('t-jersey-home').value.trim() || document.getElementById('t-jersey-home-color').value,
      jerseyAway: document.getElementById('t-jersey-away').value.trim() || document.getElementById('t-jersey-away-color').value
    };
    if (!data.name) { showTeamMsg('球隊名稱為必填', 'error'); return; }
    API.post('publicUpdateTeam', data)
      .then(function () { showTeamMsg('球隊資料已更新', 'success'); loadTeamData(); })
      .catch(function (err) { showTeamMsg(err.message || '更新失敗', 'error'); });
  }

  function savePlayer() {
    var data = {
      teamToken: token,
      name: document.getElementById('p-name').value.trim(),
      number: document.getElementById('p-number').value.trim(),
      position: document.getElementById('p-position').value,
      photo: document.getElementById('p-photo').value.trim()
    };
    if (!data.name) { showTeamMsg('球員姓名為必填', 'error'); return; }

    var action = editingPlayerId ? 'publicUpdatePlayer' : 'publicCreatePlayer';
    if (editingPlayerId) data.playerId = editingPlayerId;

    API.post(action, data)
      .then(function () {
        showTeamMsg(editingPlayerId ? '球員已更新' : '球員已新增', 'success');
        playerForm.hidden = true;
        clearPlayerForm();
        loadTeamData();
      })
      .catch(function (err) { showTeamMsg(err.message || '儲存失敗', 'error'); });
  }

  function clearPlayerForm() {
    document.getElementById('p-name').value = '';
    document.getElementById('p-number').value = '';
    document.getElementById('p-position').value = '';
    document.getElementById('p-photo').value = '';
  }

  function showError(msg) {
    loadingEl.hidden = true;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function showTeamMsg(text, type) {
    teamMsg.textContent = text;
    teamMsg.className = 'admin-message admin-message--' + type;
    teamMsg.hidden = false;
    setTimeout(function () { teamMsg.hidden = true; }, 4000);
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
})();
