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
   * @param {string} raw - ISO 日期或 YYYY-MM-DD
   * @returns {string} 如 "2026-04-09 (三)" 或 "2026年4月9日 (三)"
   */
  function formatDateWithDay(raw) {
    if (!raw) return '';
    var str = String(raw);
    var d;
    if (str.indexOf('T') !== -1) {
      d = new Date(str);
    } else {
      var p = str.split('-');
      if (p.length === 3) d = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
    }
    if (!d || isNaN(d.getTime())) return str;
    var y = d.getFullYear(); var m = d.getMonth()+1; var day = d.getDate();
    var dow = DAY_NAMES_ZH[d.getDay()];
    return y + '-' + (m<10?'0'+m:m) + '-' + (day<10?'0'+day:day) + ' (' + dow + ')';
  }

  /**
   * 格式化時間：處理 ISO 和 Google Sheets 1899 格式
   * @param {string} raw
   * @returns {string} 如 "13:23"
   */
  function formatTime(raw) {
    if (!raw) return '';
    var str = String(raw);
    if (str.indexOf('1899-12-3') !== -1) {
      var d = new Date(str);
      if (!isNaN(d.getTime())) {
        var h = d.getUTCHours(); var min = d.getUTCMinutes();
        return (h<10?'0'+h:h) + ':' + (min<10?'0'+min:min);
      }
    }
    if (str.indexOf('T') !== -1) {
      var d2 = new Date(str);
      if (!isNaN(d2.getTime())) {
        var h2 = d2.getHours(); var min2 = d2.getMinutes();
        return (h2<10?'0'+h2:h2) + ':' + (min2<10?'0'+min2:min2);
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
