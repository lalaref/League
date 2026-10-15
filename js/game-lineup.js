(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var gameId = params.get('gameId');
  var teamToken = params.get('teamToken');
  var loadingEl = document.getElementById('lineup-loading');
  var errorEl = document.getElementById('lineup-error');
  var contentEl = document.getElementById('lineup-content');
  var fixtureEl = document.getElementById('lineup-fixture');
  var teamTitleEl = document.getElementById('lineup-team-title');
  var sideEl = document.getElementById('lineup-side');
  var playersEl = document.getElementById('lineup-players');
  var saveButton = document.getElementById('btn-save-lineup');

  if (!gameId || !teamToken) {
    showError('此名單連結無效。請向聯賽管理員索取本場比賽的正確連結。');
    return;
  }

  function showError(message) {
    loadingEl.hidden = true;
    contentEl.hidden = true;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  function selectedPlayerIds() {
    return Array.prototype.slice.call(document.querySelectorAll('.lineup-player input:checked')).map(function (checkbox) { return checkbox.value; });
  }

  function render(data) {
    loadingEl.hidden = true;
    if (!data || data.error) { showError((data && data.error) || '無法載入此場名單。'); return; }
    var game = data.game || {}, team = data.team || {};
    var date = typeof Utils !== 'undefined' ? Utils.formatDateWithDay(game.date) : game.date;
    fixtureEl.textContent = date + (game.time ? ' · ' + game.time : '') + (game.venue ? ' · ' + game.venue : '') + '｜對手：' + (data.opponentName || '—');
    teamTitleEl.textContent = team.name || '球隊';
    sideEl.textContent = (team.side || '') + ' 名單';
    var selected = {};
    (data.selectedPlayerIds || []).forEach(function (id) { selected[String(id)] = true; });
    var players = data.players || [];
    playersEl.innerHTML = players.length ? players.map(function (player) {
      var number = player.number !== undefined && player.number !== null && player.number !== '' ? player.number : '?';
      return '<label class="lineup-player"><input type="checkbox" value="' + escapeHtml(player.id) + '"' + (selected[String(player.id)] ? ' checked' : '') + '><span class="lineup-player-number">' + escapeHtml(number) + '</span><span>' + escapeHtml(player.name || '未命名球員') + '</span></label>';
    }).join('') : '<div class="lineup-empty">目前沒有可選球員，請聯絡聯賽管理員。</div>';
    contentEl.hidden = false;
    if (!data.editable) {
      saveButton.hidden = true;
      var locked = document.createElement('div');
      locked.className = 'lineup-locked';
      locked.textContent = '此比賽的名單已鎖定，不能再修改。';
      playersEl.after(locked);
    } else {
      saveButton.hidden = false;
      saveButton.disabled = !players.length;
    }
  }

  function load() {
    API.getGameLineupByToken(gameId, teamToken).then(render).catch(function (error) {
      showError(error.message || '無法載入此場名單，請稍後再試。');
    });
  }

  saveButton.addEventListener('click', function () {
    var playerIds = selectedPlayerIds();
    if (!playerIds.length) {
      alert('請至少選擇一位上陣球員。');
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = '儲存中…';
    API.savePublicGameRoster(gameId, teamToken, playerIds).then(function () {
      saveButton.textContent = '✓ 名單已儲存';
      window.setTimeout(function () { saveButton.textContent = '✓ 儲存本場上陣名單'; saveButton.disabled = false; }, 1800);
    }).catch(function (error) {
      alert(error.message || '儲存失敗，請重試。');
      saveButton.textContent = '✓ 儲存本場上陣名單';
      saveButton.disabled = false;
    });
  });

  load();
})();
