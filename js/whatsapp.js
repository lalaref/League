/**
 * ALL-IN Basketball League — WhatsApp 分享模組
 * 透過 wa.me 連結分享比賽數據及賽程給球隊領隊
 * 需求：19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7
 */
var WhatsAppShare = (function () {
  'use strict';

  /**
   * 格式化比賽數據訊息（含日期、比分、Box Score 摘要）
   * @param {Object} gameData - { date, homeTeamName, awayTeamName, homeScore, awayScore }
   * @param {Object} boxScore - { homeStats: [], awayStats: [] }
   * @returns {string}
   */
  function formatGameMessage(gameData, boxScore) {
    var d = gameData || {};
    var lines = [];

    lines.push('🏀 ALL-IN Basketball League');
    lines.push('📅 ' + Utils.formatDateWithDay(d.date));
    lines.push('');
    lines.push((d.homeTeamName || 'Home') + ' ' + (d.homeScore != null ? d.homeScore : 0) +
      ' - ' + (d.awayScore != null ? d.awayScore : 0) + ' ' + (d.awayTeamName || 'Away'));

    if (boxScore) {
      lines.push('');
      lines.push('📊 Box Score 摘要：');

      if (boxScore.homeStats && boxScore.homeStats.length > 0) {
        lines.push(d.homeTeamName || 'Home' + ':');
        _appendPlayerLines(lines, boxScore.homeStats);
      }
      if (boxScore.awayStats && boxScore.awayStats.length > 0) {
        lines.push('');
        lines.push(d.awayTeamName || 'Away' + ':');
        _appendPlayerLines(lines, boxScore.awayStats);
      }
    }

    return lines.join('\n');
  }

  /**
   * 將球員統計摘要加入訊息行
   * @param {string[]} lines
   * @param {Object[]} stats
   */
  function _appendPlayerLines(lines, stats) {
    // 按得分降序排列，取前 3 名
    var sorted = stats.slice().sort(function (a, b) {
      return (b.pts || 0) - (a.pts || 0);
    });
    var top = sorted.slice(0, 3);
    top.forEach(function (p) {
      var name = p.playerName || p.playerId || '?';
      var num = p.number != null ? '#' + p.number + ' ' : '';
      lines.push(num + name + ' - ' + (p.pts || 0) + '分 ' + (p.reb || 0) + '籃板 ' + (p.ast || 0) + '助攻');
    });
  }

  /**
   * 格式化賽程訊息（含日期、時間、場地、對手）
   * @param {string} teamId - 球隊 ID
   * @param {Object[]} games - 比賽列表 [{ date, time, venue, homeTeamId, awayTeamId, homeTeamName, awayTeamName }]
   * @returns {string}
   */
  function formatScheduleMessage(teamId, games) {
    var list = games || [];
    var lines = [];

    lines.push('🏀 ALL-IN Basketball League');
    lines.push('📋 賽程通知');
    lines.push('');

    if (list.length === 0) {
      lines.push('暫無即將進行的賽程。');
      return lines.join('\n');
    }

    list.forEach(function (g) {
      var opponent = '';
      var homeAway = '';
      if (g.homeTeamId === teamId) {
        opponent = g.awayTeamName || g.awayTeamId || '?';
        homeAway = '(主場)';
      } else {
        opponent = g.homeTeamName || g.homeTeamId || '?';
        homeAway = '(客場)';
      }
      var datePart = Utils.formatDateWithDay(g.date);
      var timePart = g.time ? ' ' + Utils.formatTime(g.time) : '';
      var venuePart = g.venue ? ' | 📍 ' + g.venue : '';
      lines.push('📅 ' + datePart + timePart + venuePart);
      lines.push('   vs ' + opponent + ' ' + homeAway);
      lines.push('');
    });

    return lines.join('\n').trim();
  }

  /**
   * 透過 wa.me 連結開啟預填訊息的 WhatsApp 對話
   * @param {string} phoneNumber - 電話號碼（含國碼，不含 + 號）
   * @param {string} message - 訊息文字
   */
  function openChat(phoneNumber, message) {
    if (!phoneNumber) return;
    var phone = String(phoneNumber).replace(/[^0-9]/g, '');
    var encoded = encodeURIComponent(message || '');
    var url = 'https://wa.me/' + phone + '?text=' + encoded;
    window.open(url, '_blank');
  }

  /**
   * 批量向多支球隊領隊發送通知
   * 為每支球隊開啟一個 WhatsApp 對話視窗
   * @param {string[]} teamIds - 球隊 ID 列表
   * @param {string} message - 訊息文字
   * @param {Object[]} teams - 球隊數據列表 [{ id, captainWhatsApp, ... }]
   * @returns {{ sent: string[], skipped: string[] }}
   */
  function batchShare(teamIds, message, teams) {
    var ids = teamIds || [];
    var teamsMap = {};
    (teams || []).forEach(function (t) { teamsMap[t.id] = t; });

    var sent = [];
    var skipped = [];

    ids.forEach(function (id) {
      var result = validatePhoneNumber(id, teams);
      if (result.valid) {
        openChat(result.phone, message);
        sent.push(id);
      } else {
        skipped.push(id);
      }
    });

    return { sent: sent, skipped: skipped };
  }

  /**
   * 驗證球隊的 WhatsApp 電話號碼是否存在
   * @param {string} teamId - 球隊 ID
   * @param {Object[]} teams - 球隊數據列表
   * @returns {{ valid: boolean, phone?: string }}
   */
  function validatePhoneNumber(teamId, teams) {
    var list = teams || [];
    var team = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === teamId) {
        team = list[i];
        break;
      }
    }
    if (!team) return { valid: false };
    var phone = team.captainWhatsApp || team.whatsapp || '';
    phone = String(phone).replace(/[^0-9]/g, '');
    if (!phone) return { valid: false };
    return { valid: true, phone: phone };
  }

  // 公開 API
  return {
    formatGameMessage: formatGameMessage,
    formatScheduleMessage: formatScheduleMessage,
    openChat: openChat,
    batchShare: batchShare,
    validatePhoneNumber: validatePhoneNumber
  };
})();

// Node.js / 測試環境匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WhatsAppShare;
}
