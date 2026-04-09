/**
 * ALL-IN Basketball League — 社交文案生成器
 * 根據比賽數據自動生成 3 種風格的社交媒體文案（中英雙語）
 * 需求：18.1, 18.2, 18.3, 18.4, 18.5, 18.6
 */
var PostGenerator = (function () {
  'use strict';

  /** 可用風格 */
  var styles = ['formal', 'casual', 'analytics'];

  /** Hashtag */
  var HASHTAGS_ZH = '#ALLINBasketball #香港籃球';
  var HASHTAGS_EN = '#ALLINBasketball #HKBasketball';

  /**
   * 從 Box Score 數據中找出最佳球員（得分最高）
   * @param {Object} boxScore - { homeStats: [], awayStats: [] }
   * @returns {{ name: string, pts: number, reb: number, ast: number } | null}
   */
  function _findBestPlayer(boxScore) {
    if (!boxScore) return null;
    var all = (boxScore.homeStats || []).concat(boxScore.awayStats || []);
    if (all.length === 0) return null;
    var best = all.reduce(function (top, p) {
      return (p.pts || 0) > (top.pts || 0) ? p : top;
    }, all[0]);
    return {
      name: best.playerName || best.playerId || 'MVP',
      pts: best.pts || 0,
      reb: best.reb || 0,
      ast: best.ast || 0
    };
  }

  /**
   * 生成單一語言的文案
   * @param {Object} gameData - 比賽數據
   * @param {string} style - 風格 ('formal'|'casual'|'analytics')
   * @param {string} lang - 語言 ('zh-TW'|'en')
   * @returns {string}
   */
  function generate(gameData, style, lang) {
    var d = gameData || {};
    var date = (typeof Utils !== 'undefined' && Utils.formatDateWithDay) ? Utils.formatDateWithDay(d.date) : (d.date || '');
    var home = d.homeTeamName || 'Home';
    var away = d.awayTeamName || 'Away';
    var hs = d.homeScore != null ? d.homeScore : 0;
    var as = d.awayScore != null ? d.awayScore : 0;
    var mvp = d.mvp || null;
    var hashtags = lang === 'en' ? HASHTAGS_EN : HASHTAGS_ZH;

    var winner = hs > as ? home : (as > hs ? away : null);
    var isZh = lang !== 'en';

    if (style === 'casual') {
      return _generateCasual(date, home, away, hs, as, winner, mvp, hashtags, isZh);
    }
    if (style === 'analytics') {
      return _generateAnalytics(date, home, away, hs, as, winner, mvp, hashtags, isZh, d);
    }
    // default: formal
    return _generateFormal(date, home, away, hs, as, winner, mvp, hashtags, isZh);
  }

  /**
   * 同時生成中英文版本
   * @param {Object} gameData
   * @param {string} style
   * @returns {{ zh: string, en: string }}
   */
  function generateBilingual(gameData, style) {
    return {
      zh: generate(gameData, style, 'zh-TW'),
      en: generate(gameData, style, 'en')
    };
  }

  // ─── 正式報導風格 ───
  function _generateFormal(date, home, away, hs, as, winner, mvp, hashtags, isZh) {
    var lines = [];
    if (isZh) {
      lines.push('ALL-IN Basketball League 賽果報告');
      lines.push('📅 ' + date);
      lines.push('');
      if (winner) {
        lines.push(home + ' ' + hs + ':' + as + (hs > as ? ' 擊敗 ' : ' 不敵 ') + away + '。');
      } else {
        lines.push(home + ' ' + hs + ':' + as + ' ' + away + '（平手）。');
      }
      if (mvp) {
        lines.push('MVP ' + mvp.name + ' 攻下 ' + mvp.pts + ' 分 ' + mvp.reb + ' 籃板 ' + mvp.ast + ' 助攻帶領球隊。');
      }
      lines.push('');
      lines.push(hashtags);
    } else {
      lines.push('ALL-IN Basketball League Game Report');
      lines.push('📅 ' + date);
      lines.push('');
      if (winner) {
        var verb = hs > as ? ' defeated ' : ' lost to ';
        lines.push(home + ' ' + hs + '-' + as + verb + away + '.');
      } else {
        lines.push(home + ' ' + hs + '-' + as + ' ' + away + ' (Draw).');
      }
      if (mvp) {
        lines.push('MVP ' + mvp.name + ' finished with ' + mvp.pts + ' PTS ' + mvp.reb + ' REB ' + mvp.ast + ' AST.');
      }
      lines.push('');
      lines.push(hashtags);
    }
    return lines.join('\n');
  }

  // ─── 輕鬆社交風格 ───
  function _generateCasual(date, home, away, hs, as, winner, mvp, hashtags, isZh) {
    var lines = [];
    var diff = Math.abs(hs - as);
    if (isZh) {
      lines.push('🏀 ' + date);
      if (winner && diff >= 10) {
        lines.push('🔥 ' + winner + ' 大勝 ' + (winner === home ? away : home) + ' ' + hs + '-' + as + '！');
      } else if (winner) {
        lines.push('🔥 ' + winner + ' 險勝 ' + (winner === home ? away : home) + ' ' + hs + '-' + as + '！');
      } else {
        lines.push('⚡ ' + home + ' 與 ' + away + ' 打成平手 ' + hs + '-' + as + '！');
      }
      if (mvp) {
        lines.push(mvp.name + ' 今晚手感火熱 ' + mvp.pts + ' 分！💪');
      }
      lines.push('');
      lines.push(hashtags);
    } else {
      lines.push('🏀 ' + date);
      if (winner && diff >= 10) {
        lines.push('🔥 ' + winner + ' dominated ' + (winner === home ? away : home) + ' ' + hs + '-' + as + '!');
      } else if (winner) {
        lines.push('🔥 ' + winner + ' edged ' + (winner === home ? away : home) + ' ' + hs + '-' + as + '!');
      } else {
        lines.push('⚡ ' + home + ' and ' + away + ' tied ' + hs + '-' + as + '!');
      }
      if (mvp) {
        lines.push(mvp.name + ' was on fire with ' + mvp.pts + ' PTS! 💪');
      }
      lines.push('');
      lines.push(hashtags);
    }
    return lines.join('\n');
  }

  // ─── 數據分析風格 ───
  function _generateAnalytics(date, home, away, hs, as, winner, mvp, hashtags, isZh, gameData) {
    var lines = [];
    if (isZh) {
      lines.push('📊 數據解讀 | ' + home + ' vs ' + away + ' (' + hs + '-' + as + ')');
      lines.push('📅 ' + date);
      lines.push('');
      if (mvp) {
        lines.push('🏆 最佳球員：' + mvp.name);
        lines.push('   ' + mvp.pts + ' 分 / ' + mvp.reb + ' 籃板 / ' + mvp.ast + ' 助攻');
      }
      if (gameData.teamFgPct) {
        lines.push('');
        lines.push('球隊投籃命中率：' + gameData.teamFgPct);
      }
      lines.push('');
      lines.push(hashtags + ' #數據籃球');
    } else {
      lines.push('📊 Game Analysis | ' + home + ' vs ' + away + ' (' + hs + '-' + as + ')');
      lines.push('📅 ' + date);
      lines.push('');
      if (mvp) {
        lines.push('🏆 Best Player: ' + mvp.name);
        lines.push('   ' + mvp.pts + ' PTS / ' + mvp.reb + ' REB / ' + mvp.ast + ' AST');
      }
      if (gameData.teamFgPct) {
        lines.push('');
        lines.push('Team FG%: ' + gameData.teamFgPct);
      }
      lines.push('');
      lines.push(hashtags + ' #DataBasketball');
    }
    return lines.join('\n');
  }

  // 公開 API
  return {
    styles: styles,
    generate: generate,
    generateBilingual: generateBilingual,
    _findBestPlayer: _findBestPlayer
  };
})();

// Node.js / 測試環境匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PostGenerator;
}
