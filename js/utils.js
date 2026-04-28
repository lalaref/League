/**
 * ALL-IN Basketball League — 通用工具函數模組
 * 包含 ID 生成、日期格式化、數值格式化等通用工具
 * 需求：1.6
 */
var Utils = (function () {
  'use strict';

  /**
   * 生成 UUID v4 格式的唯一識別碼
   * 使用 crypto.getRandomValues（瀏覽器原生），含 Math.random 降級方案
   * @returns {string} UUID v4 格式字串，如 "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
   */
  function generateId() {
    // 嘗試使用 crypto.getRandomValues（安全隨機）
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      var buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      // 設定 version 4 (0100) 於第 7 byte 高 4 bits
      buf[6] = (buf[6] & 0x0f) | 0x40;
      // 設定 variant (10xx) 於第 9 byte 高 2 bits
      buf[8] = (buf[8] & 0x3f) | 0x80;

      var hex = '';
      for (var i = 0; i < 16; i++) {
        var h = buf[i].toString(16);
        hex += h.length === 1 ? '0' + h : h;
      }
      return (
        hex.substring(0, 8) + '-' +
        hex.substring(8, 12) + '-' +
        hex.substring(12, 16) + '-' +
        hex.substring(16, 20) + '-' +
        hex.substring(20, 32)
      );
    }

    // 降級方案：Math.random
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 格式化日期字串為本地化顯示格式
   * @param {string} dateStr - 日期字串，格式為 YYYY-MM-DD
   * @returns {string} 格式化後的日期，如 "2024年1月15日" 或原始字串（若無法解析）
   */
  function formatDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    // 解析 YYYY-MM-DD
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;

    return year + '年' + month + '月' + day + '日';
  }

  /**
   * 格式化數值至指定小數位數
   * @param {number} num - 要格式化的數值
   * @param {number} [decimals=1] - 小數位數，預設 1
   * @returns {string} 格式化後的數值字串
   */
  function formatNumber(num, decimals) {
    if (num === null || num === undefined || isNaN(num) || !isFinite(num)) return '0';
    var d = (decimals !== undefined && decimals !== null) ? decimals : 1;
    return Number(num).toFixed(d);
  }

  /**
   * 將小數值格式化為百分比顯示
   * @param {number} value - 小數值（如 0.456）
   * @param {number} [decimals=1] - 百分比的小數位數，預設 1
   * @returns {string} 百分比字串，如 "45.6%"
   */
  function formatPercentage(value, decimals) {
    if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '0.0%';
    var d = (decimals !== undefined && decimals !== null) ? decimals : 1;
    return (value * 100).toFixed(d) + '%';
  }

  /**
   * 格式化比賽比分顯示
   * @param {number} homeScore - 主隊得分
   * @param {number} awayScore - 客隊得分
   * @returns {string} 比分字串，如 "78 - 65"
   */
  function formatGameScore(homeScore, awayScore) {
    var h = (homeScore !== null && homeScore !== undefined && !isNaN(homeScore)) ? homeScore : 0;
    var a = (awayScore !== null && awayScore !== undefined && !isNaN(awayScore)) ? awayScore : 0;
    return h + ' - ' + a;
  }

  var DAY_NAMES_ZH = ['日', '一', '二', '三', '四', '五', '六'];

  /**
   * 格式化 ISO/YYYY-MM-DD 日期為帶星期的顯示格式
   * Google Sheets returns dates as UTC ISO strings (e.g. "2026-05-03T16:00:00.000Z"
   * which is actually 2026-05-04 00:00 in HKT). We must parse via Date object
   * and use local time methods to get the correct date.
   * @param {string|number} raw
   * @returns {string} 如 "2026-05-04 (一)"
   */
  function formatDateWithDay(raw) {
    if (raw === null || raw === undefined || raw === '') return '';

    // Handle Google Sheets serial date number
    if (typeof raw === 'number' || (typeof raw === 'string' && /^\d{5,}$/.test(String(raw).trim()))) {
      var serial = parseInt(raw, 10);
      if (serial > 1 && serial < 200000) {
        var epoch = new Date(1899, 11, 30);
        var sd = new Date(epoch.getTime() + serial * 86400000);
        if (!isNaN(sd.getTime())) {
          var sy = sd.getFullYear(); var sm = sd.getMonth() + 1; var sday = sd.getDate();
          return sy + '-' + (sm < 10 ? '0' + sm : sm) + '-' + (sday < 10 ? '0' + sday : sday) + ' (' + DAY_NAMES_ZH[sd.getDay()] + ')';
        }
      }
    }

    var str = String(raw).trim();

    // If it's an ISO string with T and Z (UTC), parse with Date to get local time
    if (str.indexOf('T') !== -1 && str.indexOf('Z') !== -1) {
      var d = new Date(str);
      if (!isNaN(d.getTime())) {
        var y = d.getFullYear(); var m = d.getMonth() + 1; var day = d.getDate();
        return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day) + ' (' + DAY_NAMES_ZH[d.getDay()] + ')';
      }
    }

    // If it's an ISO string with T but no Z (local time), or plain YYYY-MM-DD
    // Extract date parts directly from string
    var dateMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!dateMatch) return str;

    var year = parseInt(dateMatch[1], 10);
    var month = parseInt(dateMatch[2], 10);
    var dayNum = parseInt(dateMatch[3], 10);
    if (isNaN(year) || isNaN(month) || isNaN(dayNum)) return str;

    var dateObj = new Date(year, month - 1, dayNum);
    return year + '-' + (month < 10 ? '0' + month : month) + '-' + (dayNum < 10 ? '0' + dayNum : dayNum) + ' (' + DAY_NAMES_ZH[dateObj.getDay()] + ')';
  }

  /**
   * 格式化時間：處理多種格式
   * Google Sheets time values come as "1899-12-30T05:46:18.000Z" (UTC).
   * The actual local time is UTC+8, so we must parse with Date and use local time.
   * @param {string|number} raw
   * @returns {string} 如 "21:00" 或 "13:23"
   */
  function formatTime(raw) {
    if (raw === null || raw === undefined || raw === '') return '';

    // Handle numeric value (Google Sheets fraction of day)
    if (typeof raw === 'number') {
      var num = raw;
      if (num >= 0 && num < 1) {
        var totalMinutes = Math.round(num * 24 * 60);
        var fh = Math.floor(totalMinutes / 60);
        var fm = totalMinutes % 60;
        return (fh < 10 ? '0' + fh : fh) + ':' + (fm < 10 ? '0' + fm : fm);
      }
    }

    var str = String(raw).trim();

    // Already in HH:MM or HH:MM:SS format — return as HH:MM
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
      var simpleParts = str.split(':');
      var sh = parseInt(simpleParts[0], 10);
      var sm = parseInt(simpleParts[1], 10);
      return (sh < 10 ? '0' + sh : sh) + ':' + (sm < 10 ? '0' + sm : sm);
    }

    // ISO string with T — parse with Date to convert UTC to local time
    if (str.indexOf('T') !== -1) {
      var d = new Date(str);
      if (!isNaN(d.getTime())) {
        // Use local time methods (getHours/getMinutes) which auto-convert from UTC
        var h = d.getHours();
        var m = d.getMinutes();
        return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
      }
    }

    return str;
  }

  // 公開 API
  return {
    generateId: generateId,
    formatDate: formatDate,
    formatDateWithDay: formatDateWithDay,
    formatTime: formatTime,
    formatNumber: formatNumber,
    formatPercentage: formatPercentage,
    formatGameScore: formatGameScore
  };
})();

// Node.js / 測試環境匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
