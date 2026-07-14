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
  var savedNotePreview = document.getElementById('saved-note-preview');
  var saveBtn = document.getElementById('btn-save-availability');
  var clearBtn = document.getElementById('btn-clear-availability');
  var teamNamePill = document.getElementById('team-name-pill');
  var dateRangePill = document.getElementById('date-range-pill');

  var currentTeam = null;
  var days = [];
  var rangeStart = '';
  var rangeEnd = '';
  var openRangeStart = '';
  var openRangeEnd = '';
  var selected = {};
  var weekdays = ['一', '二', '三', '四', '五'];
  var dayNames = ['日', '一', '二', '三', '四', '五', '六'];

  if (!token) {
    showError('無效的連結，缺少球隊 token 參數。請聯絡聯賽管理員取得正確連結。');
    return;
  }

  saveBtn.addEventListener('click', saveAvailability);
  clearBtn.addEventListener('click', function () {
    Object.keys(selected).forEach(function (ymd) {
      if (isSelectableDate(ymd)) delete selected[ymd];
    });
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
        dateRangePill.textContent = '可填報日期：' + formatDisplayDate(openRangeStart) + ' 至 ' + formatDisplayDate(openRangeEnd);
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
    return Promise.all([
      safeLoadAvailabilityRows(startDate, endDate),
      safeLoadTeamNoteRows(startDate, endDate)
    ]).then(function (results) {
      var rows = results[0] || [];
      var noteRows = results[1] || [];
      rows.forEach(function (row) {
        if (String(row.teamId) === String(currentTeam.id) && row.unavailableDate && isDisplayDate(row.unavailableDate)) {
          selected[row.unavailableDate] = true;
          if (row.note && !noteEl.value) noteEl.value = row.note;
        }
      });
      noteRows.forEach(function (row) {
        if (String(row.teamId) === String(currentTeam.id) && row.note) {
          noteEl.value = row.note;
        }
      });
      mergeLocalBackup();
      updateSavedNotePreview();
    }).catch(function () {
      mergeLocalBackup();
      updateSavedNotePreview();
    });
  }

  function safeLoadAvailabilityRows(startDate, endDate) {
    return API.getTeamAvailability(currentTeam.seasonId, startDate, endDate).catch(function () {
      return [];
    });
  }

  function safeLoadTeamNoteRows(startDate, endDate) {
    return API.getTeamAvailabilityNotes(currentTeam.seasonId, startDate, endDate).then(function (rows) {
      return (rows || []).filter(function (row) {
        return String(row.teamId) === String(currentTeam.id);
      }).sort(function (a, b) {
        return String(a.updatedAt || a.startDate || '').localeCompare(String(b.updatedAt || b.startDate || ''));
      });
    }).catch(function () {
      return [];
    });
  }

  function updateSavedNotePreview() {
    if (!savedNotePreview) return;
    var note = noteEl.value.trim();
    if (!note) {
      savedNotePreview.hidden = true;
      savedNotePreview.innerHTML = '';
      return;
    }
    savedNotePreview.innerHTML = '<strong>已儲存備註</strong>' + escapeHtml(note);
    savedNotePreview.hidden = false;
  }

  function buildDays() {
    var openStart = getNextOpenWindowStart();
    var displayStart = getCurrentWeekStart();
    var displayEnd = new Date(openStart);
    displayEnd.setDate(openStart.getDate() + 13);

    rangeStart = toYmd(displayStart);
    openRangeStart = toYmd(openStart);
    days = [];
    for (var i = 0; ; i++) {
      var date = new Date(displayStart);
      date.setDate(displayStart.getDate() + i);
      if (date > displayEnd) break;
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        var ymd = toYmd(date);
        days.push({ date: date, ymd: ymd, selectable: ymd >= openRangeStart });
      }
    }
    rangeEnd = days.length ? days[days.length - 1].ymd : rangeStart;
    openRangeEnd = rangeEnd;
  }

  function renderCalendar() {
    calendarGrid.innerHTML = '';
    weekdays.forEach(function (weekday) {
      var label = document.createElement('div');
      label.className = 'availability-weekday';
      label.textContent = weekday;
      calendarGrid.appendChild(label);
    });

    days.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'availability-day'
        + (selected[item.ymd] ? ' is-selected' : '')
        + (item.selectable ? '' : ' is-closed');
      btn.setAttribute('aria-pressed', selected[item.ymd] ? 'true' : 'false');
      if (!item.selectable) {
        btn.setAttribute('aria-disabled', 'true');
        btn.tabIndex = -1;
      }
      btn.setAttribute('data-date', item.ymd);
      btn.innerHTML =
        '<span class="day-number">' + item.date.getDate() + '</span>' +
        '<span class="day-month">' + (item.date.getMonth() + 1) + '月</span>' +
        '<span class="day-state">' + getDayStateText(item) + '</span>';
      btn.addEventListener('click', function () {
        var ymd = this.getAttribute('data-date');
        if (!isSelectableDate(ymd)) return;
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
      if (isSelectableDate(ymd)) {
        li.innerHTML = '<span>' + formatDisplayDate(ymd) + '</span><button type="button" aria-label="移除 ' + ymd + '" data-date="' + ymd + '">×</button>';
        li.querySelector('button').addEventListener('click', function () {
          delete selected[this.getAttribute('data-date')];
          renderCalendar();
          renderSelectedList();
        });
      } else {
        li.innerHTML = '<span>' + formatDisplayDate(ymd) + '</span><span class="selected-status">不可出賽</span>';
      }
      selectedList.appendChild(li);
    });
  }

  function saveAvailability() {
    var dates = getSelectedEditableDates();
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中...';
    API.saveTeamAvailability(token, dates, noteEl.value.trim(), currentTeam.captain || currentTeam.name)
      .then(function (data) {
        syncEditableSelection((data && data.unavailableDates) || dates);
        saveLocalBackup(getSelectedDates());
        renderCalendar();
        renderSelectedList();
        updateSavedNotePreview();
        showSaveMsg('已儲存，管理員可在 Schedule Check 查看。', 'success');
      })
      .catch(function (err) {
        saveLocalBackup(getSelectedDates());
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

  function getSelectedEditableDates() {
    return getSelectedDates().filter(isSelectableDate);
  }

  function syncEditableSelection(savedDates) {
    var saved = {};
    (savedDates || []).forEach(function (ymd) {
      if (isSelectableDate(ymd)) saved[ymd] = true;
    });
    days.forEach(function (item) {
      if (!item.selectable) return;
      if (saved[item.ymd]) selected[item.ymd] = true;
      else delete selected[item.ymd];
    });
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
      if (isDisplayDate(date)) selected[date] = true;
    });
    if (local.note && !noteEl.value) noteEl.value = local.note;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  function getCurrentWeekStart() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var start = new Date(today);
    var daysSinceMonday = (today.getDay() + 6) % 7;
    start.setDate(today.getDate() - daysSinceMonday);
    return start;
  }

  function isSelectableDate(ymd) {
    return days.some(function (item) { return item.ymd === ymd && item.selectable; });
  }

  function isDisplayDate(ymd) {
    return days.some(function (item) { return item.ymd === ymd; });
  }

  function getDayStateText(item) {
    if (item.selectable) return selected[item.ymd] ? '不可出賽' : '可出賽';
    return selected[item.ymd] ? '不可出賽' : '可出賽';
  }

  function formatDisplayDate(ymd) {
    var parts = ymd.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return Number(parts[1]) + '月' + Number(parts[2]) + '日（' + dayNames[date.getDay()] + '）';
  }
})();
