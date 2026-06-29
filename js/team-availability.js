/**
 * ALL-IN Basketball League — 球隊不可出賽日期填報
 */
(function () {
  'use strict';

  var token = new URLSearchParams(window.location.search).get('token');
  var loadingEl = document.getElementById('loading-msg');
  var errorEl = document.getElementById('error-msg');
  var sectionEl = document.getElementById('availability-section');
  var saveMsg = document.getElementById('save-msg');
  var calendarGrid = document.getElementById('calendar-grid');
  var selectedList = document.getElementById('selected-list');
  var selectedCount = document.getElementById('selected-count');
  var noteEl = document.getElementById('availability-note');
  var saveBtn = document.getElementById('btn-save-availability');
  var clearBtn = document.getElementById('btn-clear-availability');
  var teamNamePill = document.getElementById('team-name-pill');
  var dateRangePill = document.getElementById('date-range-pill');

  var currentTeam = null;
  var days = [];
  var rangeStart = '';
  var rangeEnd = '';
  var selected = {};
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  if (!token) {
    showError('無效的連結，缺少球隊 token 參數。請聯絡聯賽管理員取得正確連結。');
    return;
  }

  saveBtn.addEventListener('click', saveAvailability);
  clearBtn.addEventListener('click', function () {
    selected = {};
    renderCalendar();
    renderSelectedList();
  });

  loadTeam();

  function loadTeam() {
    API.get('teamByToken', { token: token })
      .then(function (data) {
        currentTeam = data.team;
        buildDays();
        teamNamePill.textContent = '球隊：' + (currentTeam.name || '—');
        dateRangePill.textContent = '可填報日期：' + formatDisplayDate(rangeStart) + ' 至 ' + formatDisplayDate(rangeEnd);
        return loadExistingAvailability();
      })
      .then(function () {
        loadingEl.hidden = true;
        sectionEl.hidden = false;
        renderCalendar();
        renderSelectedList();
      })
      .catch(function (err) {
        showError(err.message || '載入失敗，請確認連結是否正確。');
      });
  }

  function loadExistingAvailability() {
    var startDate = rangeStart;
    var endDate = rangeEnd;
    return API.getTeamAvailability(currentTeam.seasonId, startDate, endDate)
      .then(function (rows) {
        (rows || []).forEach(function (row) {
          if (String(row.teamId) === String(currentTeam.id) && row.unavailableDate && isSelectableDate(row.unavailableDate)) {
            selected[row.unavailableDate] = true;
            if (row.note && !noteEl.value) noteEl.value = row.note;
          }
        });
        mergeLocalBackup();
      })
      .catch(function () {
        mergeLocalBackup();
      });
  }

  function buildDays() {
    var start = getNextOpenWindowStart();
    var end = new Date(start);
    end.setDate(start.getDate() + 13);
    rangeStart = toYmd(start);
    rangeEnd = toYmd(end);
    days = [];
    for (var i = 0; i < 14; i++) {
      var date = new Date(start);
      date.setDate(start.getDate() + i);
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        days.push({ date: date, ymd: toYmd(date) });
      }
    }
  }

  function renderCalendar() {
    calendarGrid.innerHTML = '';
    weekdays.forEach(function (weekday) {
      var label = document.createElement('div');
      label.className = 'availability-weekday';
      label.textContent = weekday;
      calendarGrid.appendChild(label);
    });

    var firstDay = days[0].date.getDay();
    for (var i = 0; i < firstDay; i++) {
      var empty = document.createElement('div');
      empty.className = 'availability-day is-empty';
      calendarGrid.appendChild(empty);
    }

    days.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'availability-day' + (selected[item.ymd] ? ' is-selected' : '');
      btn.setAttribute('aria-pressed', selected[item.ymd] ? 'true' : 'false');
      btn.setAttribute('data-date', item.ymd);
      btn.innerHTML =
        '<span class="day-number">' + item.date.getDate() + '</span>' +
        '<span class="day-month">' + (item.date.getMonth() + 1) + '月' + weekdays[item.date.getDay()] + '</span>' +
        '<span class="day-state">' + (selected[item.ymd] ? '不可出賽' : '可出賽') + '</span>';
      btn.addEventListener('click', function () {
        var ymd = this.getAttribute('data-date');
        if (selected[ymd]) delete selected[ymd];
        else selected[ymd] = true;
        renderCalendar();
        renderSelectedList();
      });
      calendarGrid.appendChild(btn);
    });
  }

  function renderSelectedList() {
    var dates = getSelectedDates();
    selectedList.innerHTML = '';
    selectedCount.textContent = dates.length ? '已選擇 ' + dates.length + ' 日' : '尚未選擇日期';
    dates.forEach(function (ymd) {
      var li = document.createElement('li');
      li.innerHTML = '<span>' + formatDisplayDate(ymd) + '</span><button type="button" aria-label="移除 ' + ymd + '" data-date="' + ymd + '">×</button>';
      li.querySelector('button').addEventListener('click', function () {
        delete selected[this.getAttribute('data-date')];
        renderCalendar();
        renderSelectedList();
      });
      selectedList.appendChild(li);
    });
  }

  function saveAvailability() {
    var dates = getSelectedDates();
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中...';
    API.saveTeamAvailability(token, dates, noteEl.value.trim(), currentTeam.captain || currentTeam.name)
      .then(function () {
        saveLocalBackup(dates);
        showSaveMsg('已儲存，管理員可在 Schedule Check 查看。', 'success');
      })
      .catch(function (err) {
        saveLocalBackup(dates);
        showSaveMsg((err.message || '暫時未能連接伺服器') + '。已暫存在此裝置，請稍後再提交一次。', 'error');
      })
      .finally(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = '儲存不可出賽日期';
      });
  }

  function getSelectedDates() {
    return Object.keys(selected).sort();
  }

  function localKey() {
    return 'allinTeamAvailabilityDrafts';
  }

  function readLocalStore() {
    try { return JSON.parse(localStorage.getItem(localKey()) || '{}'); }
    catch (err) { return {}; }
  }

  function saveLocalBackup(dates) {
    var store = readLocalStore();
    var key = currentTeam.seasonId + ':' + currentTeam.id;
    store[key] = {
      seasonId: currentTeam.seasonId,
      teamId: currentTeam.id,
      teamName: currentTeam.name,
      unavailableDates: dates,
      note: noteEl.value.trim(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(localKey(), JSON.stringify(store));
  }

  function mergeLocalBackup() {
    if (!currentTeam) return;
    var store = readLocalStore();
    var local = store[currentTeam.seasonId + ':' + currentTeam.id];
    if (!local) return;
    (local.unavailableDates || []).forEach(function (date) {
      if (isSelectableDate(date)) selected[date] = true;
    });
    if (local.note && !noteEl.value) noteEl.value = local.note;
  }

  function showError(msg) {
    loadingEl.hidden = true;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function showSaveMsg(text, type) {
    saveMsg.textContent = text;
    saveMsg.className = 'admin-message admin-message--' + type;
    saveMsg.hidden = false;
  }

  function toYmd(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function getNextOpenWindowStart() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var start = new Date(today);
    var daysUntilNextMonday = (8 - today.getDay()) % 7;
    if (daysUntilNextMonday === 0) daysUntilNextMonday = 7;
    if (today.getDay() === 1) {
      start.setDate(today.getDate() + 7);
    } else {
      start.setDate(today.getDate() + daysUntilNextMonday + 7);
    }
    return start;
  }

  function isSelectableDate(ymd) {
    return days.some(function (item) { return item.ymd === ymd; });
  }

  function formatDisplayDate(ymd) {
    var parts = ymd.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return Number(parts[1]) + '月' + Number(parts[2]) + '日（' + weekdays[date.getDay()] + '）';
  }
})();
