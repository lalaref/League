/**
 * ALL-IN Basketball League — API 通訊層
 * 提供前端與 Google Apps Script Web App 之間的 HTTP 通訊
 * 需求：11.1, 11.2, 11.3
 */
var API = (function () {
  'use strict';

  /** @type {string} Google Apps Script Web App 部署 URL */
  var BASE_URL = 'https://script.google.com/macros/s/AKfycbzQkJC-1ZIAnsbXyC0M6_Hwh53pvKMuZ38j_eCIVCN4Pm-XwQ-0HguJR20RjGIRl_4P/exec';

  /** @type {string} 管理後台 API Key */
  var API_KEY = 'my-allin-secret-2026';

  /** @type {number} GET 請求超時時間（毫秒） */
  var TIMEOUT_MS = 15000;

  /** @type {number} POST 請求超時時間（毫秒）— GAS 冷啟動可達 20 秒以上 */
  var POST_TIMEOUT_MS = 60000;

  /** @type {number} 最大重試次數 */
  var MAX_RETRIES = 2;

  /**
   * 設定 API 基礎 URL
   * @param {string} url - Google Apps Script Web App 部署 URL
   */
  function setBaseUrl(url) {
    BASE_URL = url;
  }

  /**
   * 設定 API Key（管理後台使用）
   * @param {string} key - API Key
   */
  function setApiKey(key) {
    API_KEY = key;
  }

  /**
   * 檢查瀏覽器是否在線
   * @returns {boolean}
   */
  function isOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  /**
   * 帶超時的 fetch 封裝
   * @param {string} url
   * @param {Object} options - fetch options
   * @param {number} timeoutMs
   * @returns {Promise<Response>}
   */
  function fetchWithTimeout(url, options, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error('請求超時'));
      }, timeoutMs);

      fetch(url, options)
        .then(function (res) {
          clearTimeout(timer);
          resolve(res);
        })
        .catch(function (err) {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * 發送 GET 請求
   * @param {string} action - API 動作名稱
   * @param {Object} [params={}] - 查詢參數
   * @returns {Promise<Object>} API 回應的 data 欄位
   */
  function get(action, params) {
    if (!isOnline()) {
      return Promise.reject(new Error('網絡離線，請檢查網絡連線'));
    }

    var queryParts = ['action=' + encodeURIComponent(action)];
    if (params) {
      Object.keys(params).forEach(function (key) {
        if (params[key] !== undefined && params[key] !== null) {
          queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
        }
      });
    }
    queryParts.push('_t=' + Date.now());
    var url = BASE_URL + '?' + queryParts.join('&');
    console.log('[API.get] BASE_URL =', BASE_URL, '| url =', url);

    return _requestWithRetry(url, { method: 'GET', redirect: 'follow' }, 0);
  }

  /**
   * 發送 POST 請求（需授權）
   * @param {string} action - API 動作名稱
   * @param {Object} data - 請求體數據
   * @returns {Promise<Object>} API 回應的 data 欄位
   */
  function post(action, data) {
    if (!isOnline()) {
      return Promise.reject(new Error('網絡離線，請檢查網絡連線'));
    }

    var url = BASE_URL;
    console.log('[API.post] BASE_URL =', BASE_URL, '| action =', action);
    if (!url || url.indexOf('script.google.com') === -1) {
      console.error('[API.post] ERROR: BASE_URL is invalid:', url);
      return Promise.reject(new Error('BASE_URL is not configured correctly. Current value: ' + url));
    }
    var body = Object.assign({}, data, { action: action, apiKey: API_KEY });

    var options = {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(body)
    };

    // POST 請求不重試（非冪等，避免重複提交）
    return _requestWithRetry(url, options, 0, { maxRetries: 0, timeoutMs: POST_TIMEOUT_MS });
  }

  /**
   * 帶重試的請求執行
   * @param {string} url
   * @param {Object} options
   * @param {number} attempt - 當前嘗試次數
   * @param {Object} [opts] - 可選配置 { maxRetries, timeoutMs }
   * @returns {Promise<Object>}
   */
  function _requestWithRetry(url, options, attempt, opts) {
    var maxRetries = (opts && opts.maxRetries !== undefined) ? opts.maxRetries : MAX_RETRIES;
    var timeoutMs = (opts && opts.timeoutMs !== undefined) ? opts.timeoutMs : TIMEOUT_MS;
    console.log('[API._requestWithRetry] attempt', attempt, '| method:', options.method, '| url:', url);
    return fetchWithTimeout(url, options, timeoutMs)
      .then(function (response) {
        console.log('[API._requestWithRetry] response status:', response.status, '| url:', response.url);
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' from ' + response.url);
        }
        return response.json().then(function (json) {
          if (json.status === 'error') {
            var err = new Error(json.message || '伺服器錯誤');
            err.code = json.code;
            throw err;
          }
          return json.data;
        });
      })
      .catch(function (err) {
        console.error('[API._requestWithRetry] error:', err.message, '| attempt:', attempt);
        if (attempt < maxRetries && _isRetryable(err)) {
          return _requestWithRetry(url, options, attempt + 1, opts);
        }
        throw err;
      });
  }

  /**
   * 判斷錯誤是否可重試
   * @param {Error} err
   * @returns {boolean}
   */
  function _isRetryable(err) {
    if (err.message === '請求超時') return true;
    if (err.message === 'Failed to fetch') return true;
    // 不重試 HTTP 狀態碼錯誤
    if (err.message && err.message.indexOf('HTTP ') === 0) return false;
    // 不重試 4xx 錯誤
    if (err.code && err.code >= 400 && err.code < 500) return false;
    return true;
  }

  // --- GET 便捷方法 ---

  function getSeasons() { return get('seasons'); }
  function getStandings(seasonId) { return get('standings', { seasonId: seasonId }); }
  function getPlayerProfile(playerId) { return get('playerProfile', { playerId: playerId }); }
  function getTeamProfile(teamId) { return get('teamProfile', { teamId: teamId }); }
  function getLeaders(seasonId, category) { return get('leaders', { seasonId: seasonId, cat: category }); }
  function getBoxScore(gameId) { return get('boxscore', { gameId: gameId }); }
  function getSchedule(seasonId) { return get('schedule', { seasonId: seasonId }); }
  function getPlayoffs(seasonId) { return get('playoffs', { seasonId: seasonId }); }
  function getShotChart(playerId, gameId) {
    var params = { playerId: playerId };
    if (gameId) params.gameId = gameId;
    return get('shotchart', params);
  }
  function getAdvancedStats(playerId) { return get('advancedStats', { playerId: playerId }); }
  function getAchievements(playerId) { return get('achievements', { playerId: playerId }); }
  function getArchive(seasonId) { return get('archive', { seasonId: seasonId }); }
  function getAnnouncements() { return get('announcements'); }
  function getTeams(seasonId) { return get('teams', { seasonId: seasonId }); }
  function getPlayers(teamId) { return get('players', { teamId: teamId }); }
  function getGames(seasonId) { return get('games', { seasonId: seasonId }); }

  // --- POST 便捷方法 ---

  function submitBoxScore(gameId, entries) {
    return post('submitBoxScore', { gameId: gameId, entries: entries });
  }
  function updateBoxScore(gameId, playerId, field, value) {
    return post('updateBoxScore', { gameId: gameId, playerId: playerId, field: field, value: value });
  }
  function submitShotLocation(gameId, playerId, x, y, made) {
    return post('submitShotLocation', { gameId: gameId, playerId: playerId, x: x, y: y, made: made });
  }

  // 公開 API
  return {
    setBaseUrl: setBaseUrl,
    setApiKey: setApiKey,
    get: get,
    post: post,
    getSeasons: getSeasons,
    getStandings: getStandings,
    getPlayerProfile: getPlayerProfile,
    getTeamProfile: getTeamProfile,
    getLeaders: getLeaders,
    getBoxScore: getBoxScore,
    getSchedule: getSchedule,
    getPlayoffs: getPlayoffs,
    getShotChart: getShotChart,
    getAdvancedStats: getAdvancedStats,
    getAchievements: getAchievements,
    getArchive: getArchive,
    getAnnouncements: getAnnouncements,
    getTeams: getTeams,
    getPlayers: getPlayers,
    getGames: getGames,
    submitBoxScore: submitBoxScore,
    updateBoxScore: updateBoxScore,
    submitShotLocation: submitShotLocation
  };
})();

// Node.js / 測試環境匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
