/**
 * ALL-IN Basketball League — Google Apps Script 後端主檔案
 * 數據庫初始化及核心工具函數
 * 需求：1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

/**
 * 生成 UUID v4 格式的唯一識別碼
 * 使用 Google Apps Script 內建的 Utilities.getUuid()
 * @returns {string} UUID v4 格式字串
 */
function generateId() {
  return Utilities.getUuid();
}

/**
 * 工作表定義：名稱及對應的標題列欄位
 * 每個工作表的欄位依據設計文件中的數據模型定義
 */
var SHEET_DEFINITIONS = {
  Seasons: [
    'id', 'name', 'status', 'startDate', 'endDate',
    'playoffTopN', 'minGamesForRanking'
  ],
  Teams: [
    'id', 'seasonId', 'name', 'logo', 'captain',
    'captainWhatsApp', 'description', 'jerseyHome', 'jerseyAway', 'teamToken'
  ],
  Players: [
    'id', 'teamId', 'name', 'number', 'height',
    'weight', 'photo', 'position'
  ],
  Games: [
    'id', 'seasonId', 'date', 'time', 'venue',
    'homeTeamId', 'awayTeamId', 'homeScore', 'awayScore',
    'homeQ1', 'homeQ2', 'homeQ3', 'homeQ4',
    'awayQ1', 'awayQ2', 'awayQ3', 'awayQ4',
    'type', 'playoffRound', 'playoffSeed', 'status', 'mvpPlayerId'
  ],
  BoxScores: [
    'id', 'gameId', 'playerId', 'teamId',
    'pts', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk',
    'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta',
    'to', 'fouls'
  ],
  ShotLocations: [
    'id', 'gameId', 'playerId', 'x', 'y',
    'made', 'shotType'
  ],
  Achievements: [
    'id', 'playerId', 'gameId', 'type', 'date',
    'description'
  ],
  Announcements: [
    'id', 'date', 'title', 'content', 'pinned'
  ],
  SeasonArchives: [
    'id', 'seasonId', 'champion', 'playoffMvp',
    'scoringLeader', 'reboundLeader', 'assistLeader',
    'bestRookie', 'summary', 'photos'
  ]
};

/**
 * 初始化數據庫：自動建立 9 個工作表及其標題列
 * 若工作表已存在則跳過，不會覆蓋現有數據
 * 需求：1.1, 1.2, 1.3, 1.4, 1.5, 1.7
 */
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = Object.keys(SHEET_DEFINITIONS);

  for (var i = 0; i < sheetNames.length; i++) {
    var sheetName = sheetNames[i];
    var headers = SHEET_DEFINITIONS[sheetName];
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    // 寫入標題列（第一行）
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);

    // 標題列格式化：粗體 + 凍結首行
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // 移除預設的空白 Sheet（名為 "Sheet1" 或 "工作表1"）
  var defaultSheets = ['Sheet1', '工作表1'];
  for (var j = 0; j < defaultSheets.length; j++) {
    var defaultSheet = ss.getSheetByName(defaultSheets[j]);
    if (defaultSheet && ss.getSheets().length > 1) {
      ss.deleteSheet(defaultSheet);
    }
  }
}

// ============================================================
// 快取機制
// 需求：11.6
// ============================================================

/** 快取 TTL：5 分鐘（300 秒） */
var CACHE_TTL = 300;

/**
 * 從快取讀取回應
 * @param {string} cacheKey - 快取鍵
 * @returns {Object|null} 解析後的 JSON 物件，或 null（快取未命中或讀取失敗）
 */
function getCachedResponse(cacheKey) {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (err) {
    // 快取讀取失敗時靜默降級
    return null;
  }
}

/**
 * 將回應寫入快取
 * @param {string} cacheKey - 快取鍵
 * @param {Object} data - 要快取的數據
 * @param {number} [ttl=300] - 快取存活時間（秒）
 */
function setCachedResponse(cacheKey, data, ttl) {
  try {
    var cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify(data), ttl || CACHE_TTL);
  } catch (err) {
    // 快取寫入失敗時靜默忽略
  }
}

/**
 * 建立快取鍵
 * 格式：{action}_{seasonId} 或 {action}_{其他相關參數}
 * @param {string} action - API action 名稱
 * @param {Object} params - 請求參數
 * @returns {string} 快取鍵
 */
function buildCacheKey(action, params) {
  if (!params) {
    return action;
  }
  if (params.gameId) {
    return action + '_' + params.gameId;
  }
  if (params.playerId) {
    return action + '_' + params.playerId;
  }
  if (params.teamId) {
    return action + '_' + params.teamId;
  }
  if (params.seasonId) {
    return action + '_' + params.seasonId;
  }
  return action;
}

/**
 * 清除與 POST 操作相關的快取鍵
 * @param {string} action - POST action 名稱
 * @param {Object} params - 請求參數（含 seasonId、gameId 等）
 */
function clearRelatedCache(action, params) {
  try {
    var cache = CacheService.getScriptCache();
    var keysToRemove = [];

    // 根據 POST action 決定要清除的快取鍵
    if (action === 'submitBoxScore' || action === 'updateBoxScore') {
      // Box Score 變更影響：standings、leaders、boxscore、playerProfile、teamProfile、advancedStats、achievements
      var gameId = params && params.gameId ? params.gameId : '';
      var seasonId = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('boxscore_' + gameId);
      keysToRemove.push('standings_' + seasonId);
      keysToRemove.push('leaders_' + seasonId);
      keysToRemove.push('standings');
      keysToRemove.push('leaders');
      keysToRemove.push('games_' + seasonId);
      keysToRemove.push('games');
      keysToRemove.push('announcements');
      // 清除球員相關快取（無法精確知道哪些球員受影響，清除通用鍵）
      if (params && params.entries && params.entries.length > 0) {
        for (var i = 0; i < params.entries.length; i++) {
          var entry = params.entries[i];
          if (entry.playerId) {
            keysToRemove.push('playerProfile_' + entry.playerId);
            keysToRemove.push('advancedStats_' + entry.playerId);
            keysToRemove.push('achievements_' + entry.playerId);
          }
          if (entry.teamId) {
            keysToRemove.push('teamProfile_' + entry.teamId);
          }
        }
      }
    } else if (action === 'createGame' || action === 'updateGame') {
      var seasonId2 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('games_' + seasonId2);
      keysToRemove.push('games');
      keysToRemove.push('schedule_' + seasonId2);
      keysToRemove.push('schedule');
    } else if (action === 'submitShotLocation') {
      var playerId = params && params.playerId ? params.playerId : '';
      var gameId2 = params && params.gameId ? params.gameId : '';
      keysToRemove.push('shotchart_' + playerId);
      keysToRemove.push('shotchart_' + gameId2);
    } else if (action === 'generatePlayoffs') {
      var seasonId3 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('playoffs_' + seasonId3);
      keysToRemove.push('playoffs');
    } else if (action === 'archiveSeason') {
      var seasonId4 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('archive_' + seasonId4);
      keysToRemove.push('archive');
      keysToRemove.push('seasons');
    } else if (action === 'createAnnouncement') {
      keysToRemove.push('announcements');
    } else if (action === 'createSeason' || action === 'updateSeason' || action === 'deleteSeason') {
      keysToRemove.push('seasons');
    } else if (action === 'createTeam' || action === 'updateTeam' || action === 'deleteTeam') {
      var seasonId5 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('teams_' + seasonId5);
      keysToRemove.push('teams');
    } else if (action === 'createPlayer' || action === 'updatePlayer' || action === 'deletePlayer') {
      var teamId2 = params && params.teamId ? params.teamId : '';
      keysToRemove.push('players_' + teamId2);
      keysToRemove.push('players');
    }

    if (keysToRemove.length > 0) {
      cache.removeAll(keysToRemove);
    }
  } catch (err) {
    // 快取清除失敗時靜默忽略
  }
}

// ============================================================
// API 路由層及授權機制
// 需求：11.1, 11.4, 11.5
// ============================================================

/**
 * 有效的 GET action 列表
 */
var VALID_GET_ACTIONS = [
  'seasons', 'teams', 'players', 'games', 'boxscore',
  'standings', 'leaders', 'playerProfile', 'teamProfile',
  'schedule', 'playoffs', 'shotchart', 'advancedStats',
  'achievements', 'archive', 'announcements', 'teamByToken'
];

/**
 * 有效的 POST action 列表
 */
var VALID_POST_ACTIONS = [
  'submitBoxScore', 'updateBoxScore', 'createGame', 'updateGame',
  'submitShotLocation', 'generatePlayoffs', 'archiveSeason',
  'createAnnouncement',
  'createSeason', 'updateSeason', 'deleteSeason',
  'createTeam', 'updateTeam', 'deleteTeam',
  'createPlayer', 'updatePlayer', 'deletePlayer',
  'publicUpdateTeam', 'publicCreatePlayer', 'publicUpdatePlayer', 'publicDeletePlayer'
];

/**
 * 建立成功回應 JSON
 * @param {Object} data - 回傳的數據
 * @param {boolean} [cached=false] - 是否來自快取
 * @returns {GoogleAppsScript.Content.TextOutput} JSON 回應
 */
function createSuccessResponse(data, cached) {
  var response = {
    status: 'success',
    data: data,
    cached: cached === true,
    timestamp: new Date().toISOString()
  };
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 建立錯誤回應 JSON
 * @param {number} code - 錯誤碼（400, 401, 500）
 * @param {string} message - 錯誤描述
 * @returns {GoogleAppsScript.Content.TextOutput} JSON 回應
 */
function createErrorResponse(code, message) {
  var response = {
    status: 'error',
    code: code,
    message: message
  };
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 驗證 API Key（從 Script Properties 讀取）
 * @param {GoogleAppsScript.Events.DoPost} e - POST 事件物件
 * @returns {boolean} 驗證是否通過
 */
function validateApiKey(e) {
  var storedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!storedKey) {
    return false;
  }

  // 從 header 或參數中取得 API Key
  var providedKey = null;

  // 嘗試從參數取得
  if (e && e.parameter && e.parameter.apiKey) {
    providedKey = e.parameter.apiKey;
  }

  // 嘗試從請求體取得
  if (!providedKey && e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (body.apiKey) {
        providedKey = body.apiKey;
      }
    } catch (err) {
      // 解析失敗，忽略
    }
  }

  // 注意：Google Apps Script Web App 無法直接讀取自訂 HTTP header（如 X-API-Key），
  // 因此 API Key 透過參數或請求體傳遞

  return providedKey === storedKey;
}

/**
 * GET 端點路由器
 * 根據 action 參數路由至對應處理函數
 * GET 端點為公開訪問，無需授權
 * @param {GoogleAppsScript.Events.DoGet} e - GET 事件物件
 * @returns {GoogleAppsScript.Content.TextOutput} JSON 回應
 */
function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;

    if (!action) {
      return createErrorResponse(400, '缺少必要參數：action');
    }

    if (VALID_GET_ACTIONS.indexOf(action) === -1) {
      return createErrorResponse(400, '無效的請求動作：' + action);
    }

    // 嘗試從快取讀取
    var params = e && e.parameter ? e.parameter : {};
    var cacheKey = buildCacheKey(action, params);
    var cachedData = getCachedResponse(cacheKey);
    if (cachedData !== null) {
      return createSuccessResponse(cachedData, true);
    }

    // 快取未命中，路由至對應處理函數
    var result;
    switch (action) {
      case 'seasons':
        result = handleGetSeasons(e);
        break;
      case 'teams':
        result = handleGetTeams(e);
        break;
      case 'players':
        result = handleGetPlayers(e);
        break;
      case 'games':
        result = handleGetGames(e);
        break;
      case 'boxscore':
        result = handleGetBoxScore(e);
        break;
      case 'standings':
        result = handleGetStandings(e);
        break;
      case 'leaders':
        result = handleGetLeaders(e);
        break;
      case 'playerProfile':
        result = handleGetPlayerProfile(e);
        break;
      case 'teamProfile':
        result = handleGetTeamProfile(e);
        break;
      case 'schedule':
        result = handleGetSchedule(e);
        break;
      case 'playoffs':
        result = handleGetPlayoffs(e);
        break;
      case 'shotchart':
        result = handleGetShotChart(e);
        break;
      case 'advancedStats':
        result = handleGetAdvancedStats(e);
        break;
      case 'achievements':
        result = handleGetAchievements(e);
        break;
      case 'archive':
        result = handleGetArchive(e);
        break;
      case 'announcements':
        result = handleGetAnnouncements(e);
        break;
      case 'teamByToken':
        result = handleGetTeamByToken(e);
        break;
      default:
        return createErrorResponse(400, '無效的請求動作：' + action);
    }

    // 將處理結果寫入快取
    try {
      var responseBody = JSON.parse(result.getContent());
      if (responseBody.status === 'success') {
        setCachedResponse(cacheKey, responseBody.data);
      }
    } catch (cacheErr) {
      // 快取寫入失敗時靜默忽略
    }

    return result;
  } catch (err) {
    return createErrorResponse(500, '伺服器內部錯誤，請稍後重試');
  }
}

/**
 * POST 端點路由器
 * 包含 API Key 驗證邏輯，根據 action 路由至對應處理函數
 * @param {GoogleAppsScript.Events.DoPost} e - POST 事件物件
 * @returns {GoogleAppsScript.Content.TextOutput} JSON 回應
 */
function doPost(e) {
  try {
    // 解析請求體
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return createErrorResponse(400, '參數格式錯誤：請求體必須為有效的 JSON');
    }

    var action = body.action;

    if (!action) {
      return createErrorResponse(400, '缺少必要參數：action');
    }

    if (VALID_POST_ACTIONS.indexOf(action) === -1) {
      return createErrorResponse(400, '無效的請求動作：' + action);
    }

    // 公開 API（使用 teamToken 驗證）不需要 API Key
    var publicActions = ['publicUpdateTeam', 'publicCreatePlayer', 'publicUpdatePlayer', 'publicDeletePlayer'];
    if (publicActions.indexOf(action) === -1) {
      // 授權驗證（非公開 API）
      if (!validateApiKey(e)) {
        return createErrorResponse(401, '未授權：缺少或無效的 API Key');
      }
    }

    // 路由至對應處理函數
    var result;
    switch (action) {
      case 'submitBoxScore':
        result = handleSubmitBoxScore(e, body);
        break;
      case 'updateBoxScore':
        result = handleUpdateBoxScore(e, body);
        break;
      case 'createGame':
        result = handleCreateGame(e, body);
        break;
      case 'updateGame':
        result = handleUpdateGame(e, body);
        break;
      case 'submitShotLocation':
        result = handleSubmitShotLocation(e, body);
        break;
      case 'generatePlayoffs':
        result = handleGeneratePlayoffs(e, body);
        break;
      case 'archiveSeason':
        result = handleArchiveSeason(e, body);
        break;
      case 'createAnnouncement':
        result = handleCreateAnnouncement(e, body);
        break;
      case 'createSeason':
        result = handleCreateSeason(e, body);
        break;
      case 'updateSeason':
        result = handleUpdateSeason(e, body);
        break;
      case 'deleteSeason':
        result = handleDeleteSeason(e, body);
        break;
      case 'createTeam':
        result = handleCreateTeam(e, body);
        break;
      case 'updateTeam':
        result = handleUpdateTeam(e, body);
        break;
      case 'deleteTeam':
        result = handleDeleteTeam(e, body);
        break;
      case 'createPlayer':
        result = handleCreatePlayer(e, body);
        break;
      case 'updatePlayer':
        result = handleUpdatePlayer(e, body);
        break;
      case 'deletePlayer':
        result = handleDeletePlayer(e, body);
        break;
      case 'publicUpdateTeam':
        result = handlePublicUpdateTeam(e, body);
        break;
      case 'publicCreatePlayer':
        result = handlePublicCreatePlayer(e, body);
        break;
      case 'publicUpdatePlayer':
        result = handlePublicUpdatePlayer(e, body);
        break;
      case 'publicDeletePlayer':
        result = handlePublicDeletePlayer(e, body);
        break;
      default:
        return createErrorResponse(400, '無效的請求動作：' + action);
    }

    // POST 成功後清除相關快取
    try {
      var responseBody = JSON.parse(result.getContent());
      if (responseBody.status === 'success') {
        clearRelatedCache(action, body);
      }
    } catch (cacheErr) {
      // 快取清除失敗時靜默忽略
    }

    return result;
  } catch (err) {
    return createErrorResponse(500, '伺服器內部錯誤，請稍後重試');
  }
}

// ============================================================
// Box Score 數據驗證器
// 需求：7.3, 7.4, 7.5
// ============================================================

/**
 * 驗證 Box Score 提交數據
 * @param {Array<Object>} entries - Box Score 記錄陣列
 * @returns {{valid: boolean, errors: Array<{index: number, field: string, message: string}>}}
 */
function validateBoxScore(entries) {
  var errors = [];

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return { valid: false, errors: [{ index: -1, field: 'entries', message: 'entries 為必填欄位' }] };
  }

  var requiredStringFields = ['playerId', 'teamId'];
  var numericFields = ['pts', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'to', 'fouls'];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];

    // 驗證必填字串欄位
    for (var s = 0; s < requiredStringFields.length; s++) {
      var sf = requiredStringFields[s];
      if (entry[sf] === undefined || entry[sf] === null || entry[sf] === '') {
        errors.push({ index: i, field: sf, message: sf + ' 為必填欄位' });
      }
    }

    // 驗證數值欄位
    for (var n = 0; n < numericFields.length; n++) {
      var nf = numericFields[n];
      var val = entry[nf];

      if (val === undefined || val === null || val === '') {
        errors.push({ index: i, field: nf, message: nf + ' 為必填欄位' });
        continue;
      }

      if (typeof val !== 'number' || !Number.isInteger(val)) {
        errors.push({ index: i, field: nf, message: nf + ' 必須為整數' });
        continue;
      }

      if (val < 0) {
        errors.push({ index: i, field: nf, message: nf + ' 不能為負數' });
      }
    }

    // 交叉驗證：FGM ≤ FGA
    if (typeof entry.fgm === 'number' && Number.isInteger(entry.fgm) && entry.fgm >= 0 &&
        typeof entry.fga === 'number' && Number.isInteger(entry.fga) && entry.fga >= 0) {
      if (entry.fgm > entry.fga) {
        errors.push({ index: i, field: 'fgm', message: '投籃命中數 (FGM) 不能超過投籃出手數 (FGA)' });
      }
    }

    // 交叉驗證：3PM ≤ 3PA
    if (typeof entry.tpm === 'number' && Number.isInteger(entry.tpm) && entry.tpm >= 0 &&
        typeof entry.tpa === 'number' && Number.isInteger(entry.tpa) && entry.tpa >= 0) {
      if (entry.tpm > entry.tpa) {
        errors.push({ index: i, field: 'tpm', message: '三分命中數 (3PM) 不能超過三分出手數 (3PA)' });
      }
    }

    // 交叉驗證：FTM ≤ FTA
    if (typeof entry.ftm === 'number' && Number.isInteger(entry.ftm) && entry.ftm >= 0 &&
        typeof entry.fta === 'number' && Number.isInteger(entry.fta) && entry.fta >= 0) {
      if (entry.ftm > entry.fta) {
        errors.push({ index: i, field: 'ftm', message: '罰球命中數 (FTM) 不能超過罰球出手數 (FTA)' });
      }
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

// ============================================================
// 聚合計算引擎 — 純邏輯函數（可測試）
// 需求：2.1, 2.2, 2.3, 2.4, 2.5, 2.6
// ============================================================

/**
 * 計算球員賽季平均數據（純邏輯函數）
 * @param {Array<Object>} boxScoreRows - 該球員在該賽季的所有 Box Score 記錄
 * @returns {{games_played: number, avg_pts: number, avg_reb: number, avg_ast: number, avg_stl: number, avg_blk: number}}
 */
function computePlayerAverages(boxScoreRows) {
  if (!boxScoreRows || boxScoreRows.length === 0) {
    return { games_played: 0, avg_pts: 0, avg_reb: 0, avg_oreb: 0, avg_dreb: 0, avg_ast: 0, avg_stl: 0, avg_blk: 0 };
  }
  var games_played = boxScoreRows.length;
  var sum_pts = 0, sum_reb = 0, sum_oreb = 0, sum_dreb = 0, sum_ast = 0, sum_stl = 0, sum_blk = 0;
  for (var i = 0; i < boxScoreRows.length; i++) {
    var row = boxScoreRows[i];
    sum_pts += (row.pts || 0);
    sum_oreb += (row.oreb || 0);
    sum_dreb += (row.dreb || 0);
    sum_reb += (row.reb || row.oreb + row.dreb || 0);
    sum_ast += (row.ast || 0);
    sum_stl += (row.stl || 0);
    sum_blk += (row.blk || 0);
  }
  return {
    games_played: games_played,
    avg_pts: sum_pts / games_played,
    avg_reb: sum_reb / games_played,
    avg_oreb: sum_oreb / games_played,
    avg_dreb: sum_dreb / games_played,
    avg_ast: sum_ast / games_played,
    avg_stl: sum_stl / games_played,
    avg_blk: sum_blk / games_played
  };
}

/**
 * 計算投籃命中率（純邏輯函數）
 * @param {Array<Object>} boxScoreRows - Box Score 記錄陣列
 * @returns {{fg_pct: number, tp_pct: number, ft_pct: number}}
 */
function computeShootingPcts(boxScoreRows) {
  if (!boxScoreRows || boxScoreRows.length === 0) {
    return { fg_pct: 0, tp_pct: 0, ft_pct: 0 };
  }
  var sum_fgm = 0, sum_fga = 0, sum_tpm = 0, sum_tpa = 0, sum_ftm = 0, sum_fta = 0;
  for (var i = 0; i < boxScoreRows.length; i++) {
    var row = boxScoreRows[i];
    sum_fgm += (row.fgm || 0);
    sum_fga += (row.fga || 0);
    sum_tpm += (row.tpm || 0);
    sum_tpa += (row.tpa || 0);
    sum_ftm += (row.ftm || 0);
    sum_fta += (row.fta || 0);
  }
  return {
    fg_pct: sum_fga === 0 ? 0 : sum_fgm / sum_fga,
    tp_pct: sum_tpa === 0 ? 0 : sum_tpm / sum_tpa,
    ft_pct: sum_fta === 0 ? 0 : sum_ftm / sum_fta
  };
}

/**
 * 計算兩隊歷史對賽紀錄（純邏輯函數）
 * @param {string} teamAId - 球隊 A 的 ID
 * @param {string} teamBId - 球隊 B 的 ID
 * @param {Array<Object>} games - 所有已完成比賽記錄（含 homeTeamId, awayTeamId, homeScore, awayScore, status）
 * @returns {{teamAWins: number, teamBWins: number, totalGames: number}}
 */
function computeHeadToHead(teamAId, teamBId, games) {
  var teamAWins = 0;
  var teamBWins = 0;
  for (var i = 0; i < games.length; i++) {
    var g = games[i];
    if (g.status !== 'completed') continue;
    var isMatch = false;
    var homeWins = g.homeScore > g.awayScore;
    if (g.homeTeamId === teamAId && g.awayTeamId === teamBId) {
      isMatch = true;
      if (homeWins) { teamAWins++; } else { teamBWins++; }
    } else if (g.homeTeamId === teamBId && g.awayTeamId === teamAId) {
      isMatch = true;
      if (homeWins) { teamBWins++; } else { teamAWins++; }
    }
  }
  return { teamAWins: teamAWins, teamBWins: teamBWins, totalGames: teamAWins + teamBWins };
}

/**
 * 計算球隊排名（純邏輯函數）
 * @param {Array<Object>} games - 所有已完成比賽（含 homeTeamId, awayTeamId, homeScore, awayScore, status, date）
 * @param {Array<Object>} teams - 球隊列表（含 id, name）
 * @param {Object} [seasonConfig] - 賽季設定
 * @returns {Array<Object>} 排名陣列，按勝率降序排列
 */
function computeTeamStandings(games, teams, seasonConfig) {
  if (!teams || teams.length === 0) return [];
  var completedGames = [];
  for (var i = 0; i < games.length; i++) {
    if (games[i].status === 'completed') {
      completedGames.push(games[i]);
    }
  }

  // 建立每隊的勝負紀錄
  var teamMap = {};
  for (var t = 0; t < teams.length; t++) {
    teamMap[teams[t].id] = {
      teamId: teams[t].id,
      teamName: teams[t].name,
      wins: 0,
      losses: 0,
      pct: 0,
      streak: '',
      gb: 0,
      gameResults: [] // { date, won }
    };
  }

  for (var g = 0; g < completedGames.length; g++) {
    var game = completedGames[g];
    var homeWon = game.homeScore > game.awayScore;
    if (teamMap[game.homeTeamId]) {
      if (homeWon) { teamMap[game.homeTeamId].wins++; } else { teamMap[game.homeTeamId].losses++; }
      teamMap[game.homeTeamId].gameResults.push({ date: game.date || '', won: homeWon });
    }
    if (teamMap[game.awayTeamId]) {
      if (!homeWon) { teamMap[game.awayTeamId].wins++; } else { teamMap[game.awayTeamId].losses++; }
      teamMap[game.awayTeamId].gameResults.push({ date: game.date || '', won: !homeWon });
    }
  }

  // 計算勝率及連勝/連敗
  var standings = [];
  var teamIds = Object.keys(teamMap);
  for (var k = 0; k < teamIds.length; k++) {
    var rec = teamMap[teamIds[k]];
    var total = rec.wins + rec.losses;
    rec.pct = total === 0 ? 0 : rec.wins / total;

    // 計算 streak：按日期排序後取最近連續結果
    rec.gameResults.sort(function(a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
    if (rec.gameResults.length > 0) {
      var lastResult = rec.gameResults[rec.gameResults.length - 1].won;
      var streakCount = 0;
      for (var s = rec.gameResults.length - 1; s >= 0; s--) {
        if (rec.gameResults[s].won === lastResult) {
          streakCount++;
        } else {
          break;
        }
      }
      rec.streak = (lastResult ? 'W' : 'L') + streakCount;
    } else {
      rec.streak = '-';
    }

    standings.push(rec);
  }

  // 排序：勝率降序，勝率相同時以對賽成績為次要依據
  standings.sort(function(a, b) {
    if (b.pct !== a.pct) return b.pct - a.pct;
    // 對賽成績 tiebreaker
    var h2h = computeHeadToHead(a.teamId, b.teamId, completedGames);
    if (h2h.teamAWins !== h2h.teamBWins) {
      return h2h.teamBWins - h2h.teamAWins; // b wins more h2h => a ranks lower
    }
    return 0;
  });

  // 計算勝差 (GB)
  if (standings.length > 0) {
    var firstWins = standings[0].wins;
    var firstLosses = standings[0].losses;
    for (var r = 0; r < standings.length; r++) {
      standings[r].gb = ((firstWins - standings[r].wins) + (standings[r].losses - firstLosses)) / 2;
    }
  }

  // 清理 gameResults（不需要回傳）
  for (var c = 0; c < standings.length; c++) {
    delete standings[c].gameResults;
  }

  return standings;
}

/**
 * 生成排行榜（純邏輯函數）
 * @param {Array<Object>} playerStats - 球員統計陣列，每項含 { playerId, playerName, teamName, games_played, avg_pts, avg_reb, avg_ast, avg_stl, avg_blk, fg_pct, tp_pct, ft_pct }
 * @param {number} [minGames=3] - 最低出場門檻
 * @returns {Object} 各類別排行榜 { pts: [...], reb: [...], ast: [...], stl: [...], blk: [...], fg_pct: [...], tp_pct: [...], ft_pct: [...] }
 */
function computeLeaderboards(playerStats, minGames) {
  if (minGames === undefined || minGames === null) minGames = 3;
  if (!playerStats || playerStats.length === 0) {
    return { pts: [], reb: [], ast: [], stl: [], blk: [], fg_pct: [], tp_pct: [], ft_pct: [] };
  }

  // 過濾出場次數達門檻的球員
  var eligible = [];
  for (var i = 0; i < playerStats.length; i++) {
    if (playerStats[i].games_played >= minGames) {
      eligible.push(playerStats[i]);
    }
  }

  var categories = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg_pct', 'tp_pct', 'ft_pct'];
  var fieldMap = {
    pts: 'avg_pts', reb: 'avg_reb', ast: 'avg_ast',
    stl: 'avg_stl', blk: 'avg_blk',
    fg_pct: 'fg_pct', tp_pct: 'tp_pct', ft_pct: 'ft_pct'
  };

  var result = {};
  for (var c = 0; c < categories.length; c++) {
    var cat = categories[c];
    var field = fieldMap[cat];
    var sorted = eligible.slice().sort(function(a, b) {
      return (b[field] || 0) - (a[field] || 0);
    });
    result[cat] = sorted.slice(0, 10).map(function(p, idx) {
      return {
        rank: idx + 1,
        playerId: p.playerId,
        playerName: p.playerName,
        teamName: p.teamName,
        value: p[field] || 0,
        games_played: p.games_played
      };
    });
  }

  return result;
}

/**
 * 驗證比賽得分一致性（純邏輯函數）
 * @param {Array<Object>} boxScoreRows - 該場比賽所有球員的 Box Score
 * @param {number} homeScore - 主隊最終比分
 * @param {number} awayScore - 客隊最終比分
 * @param {string} homeTeamId - 主隊 ID
 * @param {string} awayTeamId - 客隊 ID
 * @returns {{valid: boolean, homeSum: number, awaySum: number, homeScore: number, awayScore: number}}
 */
function computeScoreConsistency(boxScoreRows, homeScore, awayScore, homeTeamId, awayTeamId) {
  var homeSum = 0;
  var awaySum = 0;
  for (var i = 0; i < boxScoreRows.length; i++) {
    var row = boxScoreRows[i];
    if (row.teamId === homeTeamId) {
      homeSum += (row.pts || 0);
    } else if (row.teamId === awayTeamId) {
      awaySum += (row.pts || 0);
    }
  }
  return {
    valid: homeSum === homeScore && awaySum === awayScore,
    homeSum: homeSum,
    awaySum: awaySum,
    homeScore: homeScore,
    awayScore: awayScore
  };
}

// ============================================================
// 進階數據計算引擎 — 純邏輯函數（可測試）
// 需求：14.1, 14.2, 14.3
// ============================================================

/**
 * 計算進階數據統計（純邏輯函數）
 * @param {Array<Object>} boxScoreRows - 該球員的所有 Box Score 記錄
 * @returns {{ts_pct: number, usg: number, per: number, games_played: number}}
 */
function computeAdvancedStats(boxScoreRows) {
  if (!boxScoreRows || boxScoreRows.length === 0) {
    return { ts_pct: 0, usg: 0, per: 0, games_played: 0 };
  }

  var games_played = boxScoreRows.length;
  var total_pts = 0, total_reb = 0, total_ast = 0, total_stl = 0, total_blk = 0;
  var total_fgm = 0, total_fga = 0, total_ftm = 0, total_fta = 0, total_to = 0;

  for (var i = 0; i < boxScoreRows.length; i++) {
    var row = boxScoreRows[i];
    total_pts += (row.pts || 0);
    total_reb += (row.reb || 0);
    total_ast += (row.ast || 0);
    total_stl += (row.stl || 0);
    total_blk += (row.blk || 0);
    total_fgm += (row.fgm || 0);
    total_fga += (row.fga || 0);
    total_ftm += (row.ftm || 0);
    total_fta += (row.fta || 0);
    total_to += (row.to || 0);
  }

  // True Shooting % (TS%): PTS / (2 × (FGA + 0.44 × FTA))
  var ts_denominator = 2 * (total_fga + 0.44 * total_fta);
  var ts_pct = ts_denominator === 0 ? 0 : total_pts / ts_denominator;

  // Usage Rate (USG%): Simplified — (FGA + 0.44 * FTA + TO) / Games
  var usg = (total_fga + 0.44 * total_fta + total_to) / games_played;

  // Player Efficiency Rating (PER):
  // (PTS + REB + AST + STL + BLK - TO - (FGA - FGM) - (FTA - FTM)) / Games
  var per = (total_pts + total_reb + total_ast + total_stl + total_blk
    - total_to - (total_fga - total_fgm) - (total_fta - total_ftm)) / games_played;

  // Ensure all results are finite numbers
  if (!isFinite(ts_pct)) ts_pct = 0;
  if (!isFinite(usg)) usg = 0;
  if (!isFinite(per)) per = 0;

  return {
    ts_pct: ts_pct,
    usg: usg,
    per: per,
    games_played: games_played
  };
}

// ============================================================
// 成就系統 — 純邏輯函數（可測試）
// 需求：15.1, 15.2, 15.3
// ============================================================

/**
 * 判斷是否達成雙十（任意兩項統計 ≥ 10）
 * @param {Object} stats - {pts, reb, ast, stl, blk}
 * @returns {boolean}
 */
function isDoubleDouble(stats) {
  var count = 0;
  if ((stats.pts || 0) >= 10) count++;
  if ((stats.reb || 0) >= 10) count++;
  if ((stats.ast || 0) >= 10) count++;
  if ((stats.stl || 0) >= 10) count++;
  if ((stats.blk || 0) >= 10) count++;
  return count >= 2;
}

/**
 * 檢測單場比賽成就（純邏輯函數）
 * @param {Object} stats - {pts, reb, ast, stl, blk}
 * @returns {Array<string>} 觸發的成就類型代碼陣列
 */
function detectSingleGameAchievements(stats) {
  var achievements = [];
  var pts = stats.pts || 0;
  var reb = stats.reb || 0;
  var ast = stats.ast || 0;
  var blk = stats.blk || 0;

  if (pts >= 30) {
    achievements.push('PTS_30');
  }

  if (pts >= 10 && reb >= 10 && ast >= 10) {
    achievements.push('TRIPLE_DOUBLE');
  }

  if (isDoubleDouble(stats)) {
    achievements.push('DOUBLE_DOUBLE');
  }

  if (blk >= 5) {
    achievements.push('BLK_5');
  }

  return achievements;
}

/**
 * 檢測連續性成就（純邏輯函數）
 * @param {Array<Object>} gameHistory - 最近比賽統計陣列（從最舊到最新），每項含 {pts, reb, ast, stl, blk}
 * @returns {Array<string>} 觸發的連續性成就類型代碼陣列
 */
function detectStreakAchievements(gameHistory) {
  if (!gameHistory || gameHistory.length === 0) {
    return [];
  }

  var achievements = [];

  // STREAK_PTS_20: 最近 5 場連續 PTS ≥ 20
  if (gameHistory.length >= 5) {
    var allPts20 = true;
    for (var i = gameHistory.length - 5; i < gameHistory.length; i++) {
      if ((gameHistory[i].pts || 0) < 20) {
        allPts20 = false;
        break;
      }
    }
    if (allPts20) {
      achievements.push('STREAK_PTS_20');
    }
  }

  // STREAK_DD_3: 最近 3 場連續雙十
  if (gameHistory.length >= 3) {
    var allDD = true;
    for (var j = gameHistory.length - 3; j < gameHistory.length; j++) {
      if (!isDoubleDouble(gameHistory[j])) {
        allDD = false;
        break;
      }
    }
    if (allDD) {
      achievements.push('STREAK_DD_3');
    }
  }

  // STREAK_GAMES_10: 連續 10 場有出賽紀錄
  if (gameHistory.length >= 10) {
    achievements.push('STREAK_GAMES_10');
  }

  return achievements;
}

// ============================================================
// 聚合計算引擎 — Sheets 包裝函數
// 需求：2.1, 2.2, 2.3, 2.4, 2.5, 2.6
// ============================================================

/**
 * 重新計算球員賽季平均數據（Sheets 包裝函數）
 * @param {string} playerId - 球員 ID
 * @param {string} seasonId - 賽季 ID
 */
function recalculatePlayerStats(playerId, seasonId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var boxScoreSheet = ss.getSheetByName('BoxScores');
  var gamesSheet = ss.getSheetByName('Games');

  // 取得該賽季的所有比賽 ID
  var gamesData = gamesSheet.getDataRange().getValues();
  var gamesHeaders = gamesData[0];
  var seasonGameIds = [];
  for (var g = 1; g < gamesData.length; g++) {
    var row = {};
    for (var h = 0; h < gamesHeaders.length; h++) {
      row[gamesHeaders[h]] = gamesData[g][h];
    }
    if (row.seasonId === seasonId) {
      seasonGameIds.push(row.id);
    }
  }

  // 取得該球員在這些比賽中的 Box Score
  var bsData = boxScoreSheet.getDataRange().getValues();
  var bsHeaders = bsData[0];
  var playerBoxScores = [];
  for (var b = 1; b < bsData.length; b++) {
    var bsRow = {};
    for (var bh = 0; bh < bsHeaders.length; bh++) {
      bsRow[bsHeaders[bh]] = bsData[b][bh];
    }
    if (bsRow.playerId === playerId && seasonGameIds.indexOf(bsRow.gameId) !== -1) {
      playerBoxScores.push(bsRow);
    }
  }

  var averages = computePlayerAverages(playerBoxScores);
  var shooting = computeShootingPcts(playerBoxScores);

  return {
    averages: averages,
    shooting: shooting
  };
}

/**
 * 重新計算球隊排名（Sheets 包裝函數）
 * @param {string} seasonId - 賽季 ID
 */
function recalculateTeamStandings(seasonId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gamesSheet = ss.getSheetByName('Games');
  var teamsSheet = ss.getSheetByName('Teams');

  var gamesData = gamesSheet.getDataRange().getValues();
  var gamesHeaders = gamesData[0];
  var seasonGames = [];
  for (var g = 1; g < gamesData.length; g++) {
    var row = {};
    for (var h = 0; h < gamesHeaders.length; h++) {
      row[gamesHeaders[h]] = gamesData[g][h];
    }
    if (row.seasonId === seasonId) {
      seasonGames.push(row);
    }
  }

  var teamsData = teamsSheet.getDataRange().getValues();
  var teamsHeaders = teamsData[0];
  var teams = [];
  for (var t = 1; t < teamsData.length; t++) {
    var tRow = {};
    for (var th = 0; th < teamsHeaders.length; th++) {
      tRow[teamsHeaders[th]] = teamsData[t][th];
    }
    if (tRow.seasonId === seasonId) {
      teams.push(tRow);
    }
  }

  return computeTeamStandings(seasonGames, teams);
}

/**
 * 生成排行榜（Sheets 包裝函數）
 * @param {string} seasonId - 賽季 ID
 */
function generateLeaderboards(seasonId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var seasonsSheet = ss.getSheetByName('Seasons');
  var seasonsData = seasonsSheet.getDataRange().getValues();
  var seasonsHeaders = seasonsData[0];
  var minGames = 3;
  for (var s = 1; s < seasonsData.length; s++) {
    var sRow = {};
    for (var sh = 0; sh < seasonsHeaders.length; sh++) {
      sRow[seasonsHeaders[sh]] = seasonsData[s][sh];
    }
    if (sRow.id === seasonId && sRow.minGamesForRanking) {
      minGames = sRow.minGamesForRanking;
    }
  }

  // 取得所有球員的賽季統計
  var playersSheet = ss.getSheetByName('Players');
  var playersData = playersSheet.getDataRange().getValues();
  var playersHeaders = playersData[0];
  var teamsSheet = ss.getSheetByName('Teams');
  var teamsData = teamsSheet.getDataRange().getValues();
  var teamsHeaders = teamsData[0];

  var teamNameMap = {};
  for (var t = 1; t < teamsData.length; t++) {
    var tRow = {};
    for (var th = 0; th < teamsHeaders.length; th++) {
      tRow[teamsHeaders[th]] = teamsData[t][th];
    }
    teamNameMap[tRow.id] = tRow.name;
  }

  var playerStats = [];
  for (var p = 1; p < playersData.length; p++) {
    var pRow = {};
    for (var ph = 0; ph < playersHeaders.length; ph++) {
      pRow[playersHeaders[ph]] = playersData[p][ph];
    }
    var stats = recalculatePlayerStats(pRow.id, seasonId);
    if (stats.averages.games_played > 0) {
      playerStats.push({
        playerId: pRow.id,
        playerName: pRow.name,
        teamName: teamNameMap[pRow.teamId] || '',
        games_played: stats.averages.games_played,
        avg_pts: stats.averages.avg_pts,
        avg_reb: stats.averages.avg_reb,
        avg_ast: stats.averages.avg_ast,
        avg_stl: stats.averages.avg_stl,
        avg_blk: stats.averages.avg_blk,
        fg_pct: stats.shooting.fg_pct,
        tp_pct: stats.shooting.tp_pct,
        ft_pct: stats.shooting.ft_pct
      });
    }
  }

  return computeLeaderboards(playerStats, minGames);
}

/**
 * 計算投籃命中率（Sheets 包裝函數）
 * @param {string} playerId - 球員 ID
 * @param {string} seasonId - 賽季 ID
 */
function calculateShootingPercentages(playerId, seasonId) {
  var stats = recalculatePlayerStats(playerId, seasonId);
  return stats.shooting;
}

/**
 * 計算進階數據統計（Sheets 包裝函數）
 * @param {string} playerId - 球員 ID
 * @param {string} seasonId - 賽季 ID
 * @returns {{ts_pct: number, usg: number, per: number, games_played: number}}
 */
function calculateAdvancedStats(playerId, seasonId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var boxScoreSheet = ss.getSheetByName('BoxScores');
  var gamesSheet = ss.getSheetByName('Games');

  // 取得該賽季的所有比賽 ID
  var gamesData = gamesSheet.getDataRange().getValues();
  var gamesHeaders = gamesData[0];
  var seasonGameIds = [];
  for (var g = 1; g < gamesData.length; g++) {
    var row = {};
    for (var h = 0; h < gamesHeaders.length; h++) {
      row[gamesHeaders[h]] = gamesData[g][h];
    }
    if (row.seasonId === seasonId) {
      seasonGameIds.push(row.id);
    }
  }

  // 取得該球員在這些比賽中的 Box Score
  var bsData = boxScoreSheet.getDataRange().getValues();
  var bsHeaders = bsData[0];
  var playerBoxScores = [];
  for (var b = 1; b < bsData.length; b++) {
    var bsRow = {};
    for (var bh = 0; bh < bsHeaders.length; bh++) {
      bsRow[bsHeaders[bh]] = bsData[b][bh];
    }
    if (bsRow.playerId === playerId && seasonGameIds.indexOf(bsRow.gameId) !== -1) {
      playerBoxScores.push(bsRow);
    }
  }

  return computeAdvancedStats(playerBoxScores);
}

/**
 * 驗證比賽得分一致性（Sheets 包裝函數）
 * @param {string} gameId - 比賽 ID
 */
function validateScoreConsistency(gameId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gamesSheet = ss.getSheetByName('Games');
  var boxScoreSheet = ss.getSheetByName('BoxScores');

  var gamesData = gamesSheet.getDataRange().getValues();
  var gamesHeaders = gamesData[0];
  var game = null;
  for (var g = 1; g < gamesData.length; g++) {
    var row = {};
    for (var h = 0; h < gamesHeaders.length; h++) {
      row[gamesHeaders[h]] = gamesData[g][h];
    }
    if (row.id === gameId) {
      game = row;
      break;
    }
  }

  if (!game) {
    return { valid: false, homeSum: 0, awaySum: 0, homeScore: 0, awayScore: 0 };
  }

  var bsData = boxScoreSheet.getDataRange().getValues();
  var bsHeaders = bsData[0];
  var boxScores = [];
  for (var b = 1; b < bsData.length; b++) {
    var bsRow = {};
    for (var bh = 0; bh < bsHeaders.length; bh++) {
      bsRow[bsHeaders[bh]] = bsData[b][bh];
    }
    if (bsRow.gameId === gameId) {
      boxScores.push(bsRow);
    }
  }

  return computeScoreConsistency(boxScores, game.homeScore, game.awayScore, game.homeTeamId, game.awayTeamId);
}

// ============================================================
// 成就系統 — Sheets 包裝函數
// 需求：15.1, 15.2, 15.3, 15.4
// ============================================================

/**
 * 檢查單場比賽成就並寫入 Achievements 工作表（Sheets 包裝函數）
 * @param {string} gameId - 比賽 ID
 * @param {string} playerId - 球員 ID
 * @param {Object} stats - {pts, reb, ast, stl, blk}
 */
function checkSingleGameAchievements(gameId, playerId, stats) {
  try {
    var triggered = detectSingleGameAchievements(stats);
    if (triggered.length === 0) return;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Achievements');
    var today = new Date().toISOString().split('T')[0];

    for (var i = 0; i < triggered.length; i++) {
      var id = generateId();
      sheet.appendRow([id, playerId, gameId, triggered[i], today, '']);
    }
  } catch (err) {
    Logger.log('checkSingleGameAchievements error: ' + err.message);
  }
}

/**
 * 檢查連續性成就並寫入 Achievements 工作表（Sheets 包裝函數）
 * @param {string} playerId - 球員 ID
 */
function checkStreakAchievements(playerId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var boxScoreSheet = ss.getSheetByName('BoxScores');
    var gamesSheet = ss.getSheetByName('Games');
    var achievementsSheet = ss.getSheetByName('Achievements');

    // 取得所有比賽及其日期
    var gamesData = gamesSheet.getDataRange().getValues();
    var gamesHeaders = gamesData[0];
    var gameMap = {};
    for (var g = 1; g < gamesData.length; g++) {
      var gRow = {};
      for (var gh = 0; gh < gamesHeaders.length; gh++) {
        gRow[gamesHeaders[gh]] = gamesData[g][gh];
      }
      if (gRow.status === 'completed') {
        gameMap[gRow.id] = gRow;
      }
    }

    // 取得該球員的所有 Box Score
    var bsData = boxScoreSheet.getDataRange().getValues();
    var bsHeaders = bsData[0];
    var playerGames = [];
    for (var b = 1; b < bsData.length; b++) {
      var bsRow = {};
      for (var bh = 0; bh < bsHeaders.length; bh++) {
        bsRow[bsHeaders[bh]] = bsData[b][bh];
      }
      if (bsRow.playerId === playerId && gameMap[bsRow.gameId]) {
        playerGames.push({
          date: gameMap[bsRow.gameId].date || '',
          gameId: bsRow.gameId,
          pts: bsRow.pts || 0,
          reb: bsRow.reb || 0,
          ast: bsRow.ast || 0,
          stl: bsRow.stl || 0,
          blk: bsRow.blk || 0
        });
      }
    }

    // 按日期排序（最舊到最新），取最近 10 場
    playerGames.sort(function(a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
    var recent = playerGames.slice(-10);

    var triggered = detectStreakAchievements(recent);
    if (triggered.length === 0) return;

    // 讀取已有成就，避免重複
    var achData = achievementsSheet.getDataRange().getValues();
    var achHeaders = achData[0];
    var existingTypes = {};
    for (var a = 1; a < achData.length; a++) {
      var aRow = {};
      for (var ah = 0; ah < achHeaders.length; ah++) {
        aRow[achHeaders[ah]] = achData[a][ah];
      }
      if (aRow.playerId === playerId) {
        existingTypes[aRow.type] = true;
      }
    }

    var today = new Date().toISOString().split('T')[0];
    var lastGameId = recent.length > 0 ? recent[recent.length - 1].gameId : '';

    for (var t = 0; t < triggered.length; t++) {
      if (!existingTypes[triggered[t]]) {
        var id = generateId();
        achievementsSheet.appendRow([id, playerId, lastGameId, triggered[t], today, '']);
      }
    }
  } catch (err) {
    Logger.log('checkStreakAchievements error: ' + err.message);
  }
}

// ============================================================
// GET 端點處理函數
// 需求：11.2
// ============================================================

/**
 * GET ?action=seasons
 * 回傳所有賽季列表
 */
function handleGetSeasons(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Seasons');
  var rows = sheetToObjects(sheet);
  return createSuccessResponse(rows, false);
}

/**
 * GET ?action=teams&seasonId=X
 * 回傳指定賽季的球隊列表
 */
function handleGetTeams(e) {
  var seasonId = e && e.parameter ? e.parameter.seasonId : null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Teams');
  var rows = sheetToObjects(sheet);
  if (seasonId) {
    rows = rows.filter(function(r) { return r.seasonId === seasonId; });
  }
  return createSuccessResponse(rows, false);
}

/**
 * GET ?action=players&teamId=X
 * 回傳指定球隊的球員列表
 */
function handleGetPlayers(e) {
  var teamId = e && e.parameter ? e.parameter.teamId : null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Players');
  var rows = sheetToObjects(sheet);
  if (teamId) {
    rows = rows.filter(function(r) { return r.teamId === teamId; });
  }
  return createSuccessResponse(rows, false);
}

/**
 * GET ?action=games&seasonId=X
 * 回傳指定賽季的比賽列表
 */
function handleGetGames(e) {
  var seasonId = e && e.parameter ? e.parameter.seasonId : null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Games');
  var rows = sheetToObjects(sheet);
  if (seasonId) {
    rows = rows.filter(function(r) { return r.seasonId === seasonId; });
  }

  // 附加球隊名稱及球衣顏色
  var teamsSheet = ss.getSheetByName('Teams');
  var teams = sheetToObjects(teamsSheet);
  var teamNameMap = {};
  var teamJerseyMap = {};
  for (var t = 0; t < teams.length; t++) {
    teamNameMap[teams[t].id] = teams[t].name;
    teamJerseyMap[teams[t].id] = { jerseyHome: teams[t].jerseyHome || '', jerseyAway: teams[t].jerseyAway || '' };
  }
  for (var i = 0; i < rows.length; i++) {
    rows[i].homeTeamName = teamNameMap[rows[i].homeTeamId] || '';
    rows[i].awayTeamName = teamNameMap[rows[i].awayTeamId] || '';
    rows[i].homeJersey = teamJerseyMap[rows[i].homeTeamId] ? teamJerseyMap[rows[i].homeTeamId].jerseyHome : '';
    rows[i].awayJersey = teamJerseyMap[rows[i].awayTeamId] ? teamJerseyMap[rows[i].awayTeamId].jerseyAway : '';
  }

  return createSuccessResponse(rows, false);
}

/**
 * GET ?action=boxscore&gameId=X
 * 回傳單場比賽的 Box Score 詳情
 */
function handleGetBoxScore(e) {
  var gameId = e && e.parameter ? e.parameter.gameId : null;
  if (!gameId) {
    return createErrorResponse(400, '缺少必要參數：gameId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 取得比賽資訊
  var gamesSheet = ss.getSheetByName('Games');
  var games = sheetToObjects(gamesSheet);
  var game = null;
  for (var i = 0; i < games.length; i++) {
    if (games[i].id === gameId) { game = games[i]; break; }
  }
  if (!game) {
    return createErrorResponse(400, '找不到指定的比賽：' + gameId);
  }

  // 解析球隊名稱及球衣顏色
  var teamsSheet = ss.getSheetByName('Teams');
  var teams = sheetToObjects(teamsSheet);
  var teamMap = {};
  var teamInfoMap = {};
  for (var t = 0; t < teams.length; t++) {
    teamMap[teams[t].id] = teams[t].name;
    teamInfoMap[teams[t].id] = { jerseyHome: teams[t].jerseyHome || '', jerseyAway: teams[t].jerseyAway || '' };
  }
  game.homeTeamName = teamMap[game.homeTeamId] || game.homeTeamId;
  game.awayTeamName = teamMap[game.awayTeamId] || game.awayTeamId;
  game.homeJersey = teamInfoMap[game.homeTeamId] ? teamInfoMap[game.homeTeamId].jerseyHome : '';
  game.awayJersey = teamInfoMap[game.awayTeamId] ? teamInfoMap[game.awayTeamId].jerseyAway : '';

  // 解析球員名稱
  var playersSheet = ss.getSheetByName('Players');
  var players = sheetToObjects(playersSheet);
  var playerMap = {};
  for (var p = 0; p < players.length; p++) {
    playerMap[players[p].id] = { name: players[p].name, number: players[p].number };
  }

  // 取得 Box Score
  var bsSheet = ss.getSheetByName('BoxScores');
  var allBs = sheetToObjects(bsSheet);
  var homeStats = [];
  var awayStats = [];
  for (var b = 0; b < allBs.length; b++) {
    if (allBs[b].gameId === gameId) {
      var playerInfo = playerMap[allBs[b].playerId];
      if (playerInfo) {
        allBs[b].playerName = playerInfo.name;
        allBs[b].number = playerInfo.number;
      }
      if (allBs[b].teamId === game.homeTeamId) {
        homeStats.push(allBs[b]);
      } else if (allBs[b].teamId === game.awayTeamId) {
        awayStats.push(allBs[b]);
      }
    }
  }

  return createSuccessResponse({ game: game, homeStats: homeStats, awayStats: awayStats }, false);
}

/**
 * GET ?action=standings&seasonId=X
 * 回傳指定賽季的排名表
 */
function handleGetStandings(e) {
  var seasonId = e && e.parameter ? e.parameter.seasonId : null;
  if (!seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }
  var standings = recalculateTeamStandings(seasonId);
  return createSuccessResponse(standings, false);
}

/**
 * GET ?action=leaders&seasonId=X&category=Y
 * 回傳指定賽季的排行榜
 */
function handleGetLeaders(e) {
  var seasonId = e && e.parameter ? e.parameter.seasonId : null;
  var category = e && e.parameter ? e.parameter.category : null;
  if (!seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }
  var leaderboards = generateLeaderboards(seasonId);
  if (category && leaderboards[category]) {
    return createSuccessResponse(leaderboards[category], false);
  }
  return createSuccessResponse(leaderboards, false);
}

/**
 * GET ?action=playerProfile&playerId=X
 * 回傳球員完整檔案（基本資料、賽季平均、逐場記錄、成就）
 */
function handleGetPlayerProfile(e) {
  var playerId = e && e.parameter ? e.parameter.playerId : null;
  if (!playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 球員基本資料
  var playersSheet = ss.getSheetByName('Players');
  var players = sheetToObjects(playersSheet);
  var playerInfo = null;
  for (var i = 0; i < players.length; i++) {
    if (players[i].id === playerId) { playerInfo = players[i]; break; }
  }
  if (!playerInfo) {
    return createErrorResponse(400, '找不到指定的球員：' + playerId);
  }

  // 取得所有 Box Score
  var bsSheet = ss.getSheetByName('BoxScores');
  var allBs = sheetToObjects(bsSheet);
  var playerBs = allBs.filter(function(r) { return r.playerId === playerId; });

  // 取得比賽資訊（用於日期及賽季分組）
  var gamesSheet = ss.getSheetByName('Games');
  var allGames = sheetToObjects(gamesSheet);
  var gameMap = {};
  for (var g = 0; g < allGames.length; g++) {
    gameMap[allGames[g].id] = allGames[g];
  }

  // 逐場記錄（gameLogs）
  var gameLogs = playerBs.map(function(bs) {
    var gm = gameMap[bs.gameId] || {};
    return {
      gameId: bs.gameId,
      date: gm.date || '',
      seasonId: gm.seasonId || '',
      pts: bs.pts, reb: bs.reb, ast: bs.ast,
      stl: bs.stl, blk: bs.blk,
      fgm: bs.fgm, fga: bs.fga, tpm: bs.tpm, tpa: bs.tpa,
      ftm: bs.ftm, fta: bs.fta, to: bs.to, fouls: bs.fouls
    };
  });
  gameLogs.sort(function(a, b) {
    return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
  });

  // 按賽季分組計算平均
  var seasonGroups = {};
  for (var j = 0; j < playerBs.length; j++) {
    var gm2 = gameMap[playerBs[j].gameId];
    var sid = gm2 ? gm2.seasonId : 'unknown';
    if (!seasonGroups[sid]) seasonGroups[sid] = [];
    seasonGroups[sid].push(playerBs[j]);
  }
  var seasonAvg = {};
  var seasonIds = Object.keys(seasonGroups);
  for (var s = 0; s < seasonIds.length; s++) {
    var sRows = seasonGroups[seasonIds[s]];
    seasonAvg[seasonIds[s]] = {
      averages: computePlayerAverages(sRows),
      shooting: computeShootingPcts(sRows)
    };
  }

  // 成就
  var achSheet = ss.getSheetByName('Achievements');
  var allAch = sheetToObjects(achSheet);
  var achievements = allAch.filter(function(a) { return a.playerId === playerId; });

  return createSuccessResponse({
    info: playerInfo,
    seasonAvg: seasonAvg,
    gameLogs: gameLogs,
    achievements: achievements
  }, false);
}

/**
 * GET ?action=teamProfile&teamId=X
 * 回傳球隊完整檔案（基本資料、球員名單、歷史排名、H2H）
 * 需求：5.4 — 歷史對賽紀錄
 */
function handleGetTeamProfile(e) {
  var teamId = e && e.parameter ? e.parameter.teamId : null;
  var vsTeamId = e && e.parameter ? e.parameter.vsTeamId : null;
  if (!teamId) {
    return createErrorResponse(400, '缺少必要參數：teamId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 球隊基本資料
  var teamsSheet = ss.getSheetByName('Teams');
  var teams = sheetToObjects(teamsSheet);
  var teamInfo = null;
  for (var i = 0; i < teams.length; i++) {
    if (teams[i].id === teamId) { teamInfo = teams[i]; break; }
  }
  if (!teamInfo) {
    return createErrorResponse(400, '找不到指定的球隊：' + teamId);
  }

  // 球員名單
  var playersSheet = ss.getSheetByName('Players');
  var allPlayers = sheetToObjects(playersSheet);
  var roster = allPlayers.filter(function(p) { return p.teamId === teamId; });

  // 為每位球員附加賽季平均數據
  var bsSheet = ss.getSheetByName('BoxScores');
  var allBs = sheetToObjects(bsSheet);
  for (var r = 0; r < roster.length; r++) {
    var pBs = allBs.filter(function(b) { return b.playerId === roster[r].id; });
    roster[r].seasonAvg = computePlayerAverages(pBs);
  }

  // 歷史排名（跨賽季）
  var seasonsSheet = ss.getSheetByName('Seasons');
  var seasons = sheetToObjects(seasonsSheet);
  var gamesSheet = ss.getSheetByName('Games');
  var allGames = sheetToObjects(gamesSheet);

  var history = [];
  for (var s = 0; s < seasons.length; s++) {
    // 檢查該球隊是否參與此賽季
    var seasonTeams = teams.filter(function(t) { return t.seasonId === seasons[s].id; });
    var inSeason = false;
    for (var st = 0; st < seasonTeams.length; st++) {
      if (seasonTeams[st].id === teamId) { inSeason = true; break; }
    }
    if (!inSeason) continue;

    var seasonGames = allGames.filter(function(g) { return g.seasonId === seasons[s].id; });
    var standings = computeTeamStandings(seasonGames, seasonTeams);
    for (var k = 0; k < standings.length; k++) {
      if (standings[k].teamId === teamId) {
        history.push({
          seasonId: seasons[s].id,
          seasonName: seasons[s].name,
          rank: k + 1,
          wins: standings[k].wins,
          losses: standings[k].losses,
          pct: standings[k].pct
        });
        break;
      }
    }
  }

  // 歷史對賽紀錄（H2H）— 需求 5.4
  var h2h = {};
  if (vsTeamId) {
    var h2hResult = computeHeadToHead(teamId, vsTeamId, allGames);
    // 列出各場比分
    var h2hGames = [];
    for (var hg = 0; hg < allGames.length; hg++) {
      var gm = allGames[hg];
      if (gm.status !== 'completed') continue;
      if ((gm.homeTeamId === teamId && gm.awayTeamId === vsTeamId) ||
          (gm.homeTeamId === vsTeamId && gm.awayTeamId === teamId)) {
        h2hGames.push({
          gameId: gm.id,
          date: gm.date,
          homeTeamId: gm.homeTeamId,
          awayTeamId: gm.awayTeamId,
          homeScore: gm.homeScore,
          awayScore: gm.awayScore
        });
      }
    }
    h2h = {
      vsTeamId: vsTeamId,
      teamAWins: h2hResult.teamAWins,
      teamBWins: h2hResult.teamBWins,
      totalGames: h2hResult.totalGames,
      games: h2hGames
    };
  }

  return createSuccessResponse({
    info: teamInfo,
    roster: roster,
    history: history,
    h2h: h2h
  }, false);
}

/**
 * GET ?action=schedule&seasonId=X
 * 回傳指定賽季的完整賽程
 */
function handleGetSchedule(e) {
  var seasonId = e && e.parameter ? e.parameter.seasonId : null;
  if (!seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gamesSheet = ss.getSheetByName('Games');
  var allGames = sheetToObjects(gamesSheet);
  var schedule = allGames.filter(function(g) { return g.seasonId === seasonId; });

  // 附加球隊名稱
  var teamsSheet = ss.getSheetByName('Teams');
  var teams = sheetToObjects(teamsSheet);
  var teamNameMap = {};
  for (var t = 0; t < teams.length; t++) {
    teamNameMap[teams[t].id] = teams[t].name;
  }
  for (var i = 0; i < schedule.length; i++) {
    schedule[i].homeTeamName = teamNameMap[schedule[i].homeTeamId] || '';
    schedule[i].awayTeamName = teamNameMap[schedule[i].awayTeamId] || '';
  }

  // 按日期排序
  schedule.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || '') < (b.time || '') ? -1 : 1;
  });

  return createSuccessResponse(schedule, false);
}

/**
 * GET ?action=playoffs&seasonId=X
 * 回傳指定賽季的季後賽對陣表
 */
function handleGetPlayoffs(e) {
  var seasonId = e && e.parameter ? e.parameter.seasonId : null;
  if (!seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gamesSheet = ss.getSheetByName('Games');
  var allGames = sheetToObjects(gamesSheet);

  var playoffGames = allGames.filter(function(g) {
    return g.seasonId === seasonId && g.type === 'playoff';
  });

  // 附加球隊名稱
  var teamsSheet = ss.getSheetByName('Teams');
  var teams = sheetToObjects(teamsSheet);
  var teamNameMap = {};
  for (var t = 0; t < teams.length; t++) {
    teamNameMap[teams[t].id] = teams[t].name;
  }

  // 按輪次分組
  var rounds = {};
  for (var i = 0; i < playoffGames.length; i++) {
    var g = playoffGames[i];
    var round = g.playoffRound || 1;
    if (!rounds[round]) rounds[round] = [];
    rounds[round].push({
      gameId: g.id,
      round: round,
      seed: g.playoffSeed,
      homeTeamId: g.homeTeamId,
      homeTeamName: teamNameMap[g.homeTeamId] || '',
      awayTeamId: g.awayTeamId,
      awayTeamName: teamNameMap[g.awayTeamId] || '',
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      status: g.status
    });
  }

  return createSuccessResponse({ bracket: playoffGames, rounds: rounds }, false);
}

/**
 * GET ?action=shotchart&playerId=X&gameId=Y
 * 回傳投籃位置數據
 */
function handleGetShotChart(e) {
  var playerId = e && e.parameter ? e.parameter.playerId : null;
  var gameId = e && e.parameter ? e.parameter.gameId : null;
  if (!playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ShotLocations');
  var rows = sheetToObjects(sheet);

  var shots = rows.filter(function(r) {
    if (r.playerId !== playerId) return false;
    if (gameId && r.gameId !== gameId) return false;
    return true;
  });

  return createSuccessResponse(shots, false);
}

/**
 * GET ?action=advancedStats&playerId=X
 * 回傳球員進階數據
 */
function handleGetAdvancedStats(e) {
  var playerId = e && e.parameter ? e.parameter.playerId : null;
  if (!playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 取得該球員所有 Box Score
  var bsSheet = ss.getSheetByName('BoxScores');
  var allBs = sheetToObjects(bsSheet);
  var playerBs = allBs.filter(function(r) { return r.playerId === playerId; });

  var advanced = computeAdvancedStats(playerBs);
  var shooting = computeShootingPcts(playerBs);
  var averages = computePlayerAverages(playerBs);

  return createSuccessResponse({
    playerId: playerId,
    ts_pct: advanced.ts_pct,
    usg: advanced.usg,
    per: advanced.per,
    games_played: advanced.games_played,
    fg_pct: shooting.fg_pct,
    tp_pct: shooting.tp_pct,
    ft_pct: shooting.ft_pct,
    averages: averages
  }, false);
}

/**
 * GET ?action=achievements&playerId=X
 * 回傳球員成就列表
 */
function handleGetAchievements(e) {
  var playerId = e && e.parameter ? e.parameter.playerId : null;
  if (!playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Achievements');
  var rows = sheetToObjects(sheet);
  var achievements = rows.filter(function(r) { return r.playerId === playerId; });
  return createSuccessResponse(achievements, false);
}

/**
 * GET ?action=archive&seasonId=X
 * 回傳賽季歷史檔案
 */
function handleGetArchive(e) {
  var seasonId = e && e.parameter ? e.parameter.seasonId : null;
  if (!seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var archiveSheet = ss.getSheetByName('SeasonArchives');
  var archives = sheetToObjects(archiveSheet);
  var archive = null;
  for (var i = 0; i < archives.length; i++) {
    if (archives[i].seasonId === seasonId) { archive = archives[i]; break; }
  }
  if (!archive) {
    return createErrorResponse(400, '找不到指定賽季的歷史檔案：' + seasonId);
  }

  // 附加排名及比賽結果
  var standings = recalculateTeamStandings(seasonId);
  var gamesSheet = ss.getSheetByName('Games');
  var allGames = sheetToObjects(gamesSheet);
  var seasonGames = allGames.filter(function(g) {
    return g.seasonId === seasonId && g.status === 'completed';
  });

  return createSuccessResponse({
    archive: archive,
    standings: standings,
    games: seasonGames
  }, false);
}

/**
 * GET ?action=announcements
 * 回傳公告列表
 */
function handleGetAnnouncements(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Announcements');
  var rows = sheetToObjects(sheet);
  // 按日期降序排列，置頂公告優先
  rows.sort(function(a, b) {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.date > b.date ? -1 : (a.date < b.date ? 1 : 0);
  });
  return createSuccessResponse(rows, false);
}

// ============================================================
// POST 端點處理函數
// 需求：7.6, 7.7, 8.3, 8.5, 9.2, 11.3, 16.1, 16.2
// ============================================================

/**
 * 讀取工作表數據為物件陣列的通用輔助函數
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表
 * @returns {Array<Object>} 物件陣列
 */
function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var h = 0; h < headers.length; h++) {
      obj[headers[h]] = data[i][h];
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * 查找工作表中某行的行號（1-indexed，含標題列）
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表
 * @param {string} idColumn - ID 欄位名稱
 * @param {string} idValue - 要查找的 ID 值
 * @returns {number} 行號（-1 表示未找到）
 */
function findRowIndex(sheet, idColumn, idValue) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colIdx = headers.indexOf(idColumn);
  if (colIdx === -1) return -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === String(idValue)) {
      return i + 1; // 1-indexed for Sheets API
    }
  }
  return -1;
}

/**
 * 取得比賽的 seasonId（輔助函數）
 * @param {string} gameId - 比賽 ID
 * @returns {string} seasonId 或空字串
 */
function getSeasonIdForGame(gameId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gamesSheet = ss.getSheetByName('Games');
  var games = sheetToObjects(gamesSheet);
  for (var i = 0; i < games.length; i++) {
    if (games[i].id === gameId) {
      return games[i].seasonId || '';
    }
  }
  return '';
}

/**
 * 提交 Box Score 數據
 * 需求：7.6, 11.3
 * @param {Object} e - 事件物件
 * @param {Object} body - {gameId, entries[{playerId, teamId, pts, reb, ast, ...}]}
 */
function handleSubmitBoxScore(e, body) {
  // 驗證必要參數
  if (!body.gameId) {
    return createErrorResponse(400, '缺少必要參數：gameId');
  }
  if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) {
    return createErrorResponse(400, '缺少必要參數：entries');
  }

  // 驗證 Box Score 數據
  var validation = validateBoxScore(body.entries);
  if (!validation.valid) {
    return createErrorResponse(400, '數據驗證失敗：' + JSON.stringify(validation.errors));
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var boxScoreSheet = ss.getSheetByName('BoxScores');
  var gamesSheet = ss.getSheetByName('Games');

  // 驗證比賽存在
  var games = sheetToObjects(gamesSheet);
  var game = null;
  for (var g = 0; g < games.length; g++) {
    if (games[g].id === body.gameId) {
      game = games[g];
      break;
    }
  }
  if (!game) {
    return createErrorResponse(400, '找不到指定的比賽：' + body.gameId);
  }

  // 寫入 BoxScores 工作表
  var headers = SHEET_DEFINITIONS.BoxScores;
  var insertedIds = [];
  for (var i = 0; i < body.entries.length; i++) {
    var entry = body.entries[i];
    // 自動計算 reb = oreb + dreb
    entry.reb = (entry.oreb || 0) + (entry.dreb || 0);
    var id = generateId();
    insertedIds.push(id);
    var row = [];
    for (var h = 0; h < headers.length; h++) {
      var col = headers[h];
      if (col === 'id') {
        row.push(id);
      } else if (col === 'gameId') {
        row.push(body.gameId);
      } else {
        row.push(entry[col] !== undefined ? entry[col] : '');
      }
    }
    boxScoreSheet.appendRow(row);
  }

  // 更新比賽比分（從 Box Score 計算）
  var homeSum = 0;
  var awaySum = 0;
  for (var j = 0; j < body.entries.length; j++) {
    if (body.entries[j].teamId === game.homeTeamId) {
      homeSum += (body.entries[j].pts || 0);
    } else if (body.entries[j].teamId === game.awayTeamId) {
      awaySum += (body.entries[j].pts || 0);
    }
  }

  // 更新 Games 工作表的比分、節分及狀態
  var gameRowIdx = findRowIndex(gamesSheet, 'id', body.gameId);
  if (gameRowIdx > 0) {
    var gHeaders = SHEET_DEFINITIONS.Games;
    var homeScoreCol = gHeaders.indexOf('homeScore') + 1;
    var awayScoreCol = gHeaders.indexOf('awayScore') + 1;
    var statusCol = gHeaders.indexOf('status') + 1;
    if (homeScoreCol > 0) gamesSheet.getRange(gameRowIdx, homeScoreCol).setValue(homeSum);
    if (awayScoreCol > 0) gamesSheet.getRange(gameRowIdx, awayScoreCol).setValue(awaySum);
    if (statusCol > 0) gamesSheet.getRange(gameRowIdx, statusCol).setValue('completed');

    // 儲存節分 (Q1-Q4)
    var quarterFields = ['homeQ1','homeQ2','homeQ3','homeQ4','awayQ1','awayQ2','awayQ3','awayQ4'];
    for (var q = 0; q < quarterFields.length; q++) {
      var qf = quarterFields[q];
      var qCol = gHeaders.indexOf(qf) + 1;
      if (qCol > 0 && body[qf] !== undefined) {
        gamesSheet.getRange(gameRowIdx, qCol).setValue(parseInt(body[qf], 10) || 0);
      }
    }
  }

  // 觸發聚合計算、進階數據計算及成就檢查
  var seasonId = game.seasonId || '';
  try {
    if (seasonId) {
      recalculateTeamStandings(seasonId);
      generateLeaderboards(seasonId);
    }
  } catch (aggErr) {
    Logger.log('聚合計算錯誤: ' + aggErr.message);
  }

  // 進階數據計算及成就檢查（逐球員）
  var processedPlayers = {};
  for (var k = 0; k < body.entries.length; k++) {
    var pid = body.entries[k].playerId;
    if (pid && !processedPlayers[pid]) {
      processedPlayers[pid] = true;
      try {
        if (seasonId) {
          calculateAdvancedStats(pid, seasonId);
        }
        checkSingleGameAchievements(body.gameId, pid, body.entries[k]);
        checkStreakAchievements(pid);
      } catch (achErr) {
        Logger.log('成就/進階數據計算錯誤: ' + achErr.message);
      }
    }
  }

  return createSuccessResponse({
    message: 'Box Score 提交成功',
    gameId: body.gameId,
    insertedCount: body.entries.length,
    insertedIds: insertedIds,
    homeScore: homeSum,
    awayScore: awaySum
  }, false);
}

/**
 * 修改已提交的 Box Score 數據
 * 需求：7.7
 * @param {Object} e - 事件物件
 * @param {Object} body - {gameId, playerId, field, value}
 */
function handleUpdateBoxScore(e, body) {
  if (!body.gameId) {
    return createErrorResponse(400, '缺少必要參數：gameId');
  }
  if (!body.playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  if (!body.field) {
    return createErrorResponse(400, '缺少必要參數：field');
  }
  if (body.value === undefined || body.value === null) {
    return createErrorResponse(400, '缺少必要參數：value');
  }

  // 驗證 field 是否為有效的 BoxScore 欄位
  var editableFields = ['pts', 'reb', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'to', 'fouls'];
  if (editableFields.indexOf(body.field) === -1) {
    return createErrorResponse(400, '無效的欄位名稱：' + body.field);
  }

  // 驗證 value 為非負整數
  if (typeof body.value !== 'number' || !Number.isInteger(body.value) || body.value < 0) {
    return createErrorResponse(400, body.field + ' 必須為非負整數');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var boxScoreSheet = ss.getSheetByName('BoxScores');
  var data = boxScoreSheet.getDataRange().getValues();
  var headers = data[0];

  // 找到對應的 Box Score 記錄
  var targetRow = -1;
  var gameIdCol = headers.indexOf('gameId');
  var playerIdCol = headers.indexOf('playerId');
  var fieldCol = headers.indexOf(body.field);

  if (fieldCol === -1) {
    return createErrorResponse(400, '無效的欄位名稱：' + body.field);
  }

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][gameIdCol]) === String(body.gameId) &&
        String(data[i][playerIdCol]) === String(body.playerId)) {
      targetRow = i + 1; // 1-indexed
      break;
    }
  }

  if (targetRow === -1) {
    return createErrorResponse(400, '找不到指定的 Box Score 記錄');
  }

  // 讀取當前記錄做交叉驗證
  var currentRow = {};
  for (var h = 0; h < headers.length; h++) {
    currentRow[headers[h]] = data[targetRow - 1][h];
  }
  // 模擬更新後的值
  currentRow[body.field] = body.value;

  // 交叉驗證
  if (currentRow.fgm > currentRow.fga) {
    return createErrorResponse(400, '投籃命中數 (FGM) 不能超過投籃出手數 (FGA)');
  }
  if (currentRow.tpm > currentRow.tpa) {
    return createErrorResponse(400, '三分命中數 (3PM) 不能超過三分出手數 (3PA)');
  }
  if (currentRow.ftm > currentRow.fta) {
    return createErrorResponse(400, '罰球命中數 (FTM) 不能超過罰球出手數 (FTA)');
  }

  // 更新欄位
  boxScoreSheet.getRange(targetRow, fieldCol + 1).setValue(body.value);

  // 重新觸發聚合計算
  var seasonId = getSeasonIdForGame(body.gameId);
  try {
    if (seasonId) {
      recalculateTeamStandings(seasonId);
      generateLeaderboards(seasonId);
      calculateAdvancedStats(body.playerId, seasonId);
    }
  } catch (aggErr) {
    Logger.log('重新聚合計算錯誤: ' + aggErr.message);
  }

  return createSuccessResponse({
    message: 'Box Score 修改成功',
    gameId: body.gameId,
    playerId: body.playerId,
    field: body.field,
    newValue: body.value
  }, false);
}

/**
 * 建立比賽
 * @param {Object} e - 事件物件
 * @param {Object} body - {seasonId, date, time, venue, homeTeamId, awayTeamId}
 */
function handleCreateGame(e, body) {
  if (!body.seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }
  if (!body.date) {
    return createErrorResponse(400, '缺少必要參數：date');
  }
  if (!body.homeTeamId) {
    return createErrorResponse(400, '缺少必要參數：homeTeamId');
  }
  if (!body.awayTeamId) {
    return createErrorResponse(400, '缺少必要參數：awayTeamId');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gamesSheet = ss.getSheetByName('Games');
  var id = generateId();

  var headers = SHEET_DEFINITIONS.Games;
  var row = [];
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') {
      row.push(id);
    } else if (col === 'status') {
      row.push(body.status || 'scheduled');
    } else if (col === 'type') {
      row.push(body.type || 'regular');
    } else if (col === 'homeScore' || col === 'awayScore') {
      row.push(body[col] || 0);
    } else {
      row.push(body[col] !== undefined ? body[col] : '');
    }
  }

  gamesSheet.appendRow(row);

  return createSuccessResponse({
    message: '比賽建立成功',
    gameId: id
  }, false);
}

/**
 * 更新比賽資訊
 * @param {Object} e - 事件物件
 * @param {Object} body - {gameId, ...fields}
 */
function handleUpdateGame(e, body) {
  if (!body.gameId) {
    return createErrorResponse(400, '缺少必要參數：gameId');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gamesSheet = ss.getSheetByName('Games');
  var rowIdx = findRowIndex(gamesSheet, 'id', body.gameId);

  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到指定的比賽：' + body.gameId);
  }

  var headers = SHEET_DEFINITIONS.Games;
  var updatedFields = [];

  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') continue; // 不允許修改 ID
    if (body[col] !== undefined) {
      gamesSheet.getRange(rowIdx, h + 1).setValue(body[col]);
      updatedFields.push(col);
    }
  }

  return createSuccessResponse({
    message: '比賽更新成功',
    gameId: body.gameId,
    updatedFields: updatedFields
  }, false);
}


/**
 * 記錄投籃位置
 * 需求：9.2
 * @param {Object} e - 事件物件
 * @param {Object} body - {gameId, playerId, x, y, made}
 */
function handleSubmitShotLocation(e, body) {
  if (!body.gameId) {
    return createErrorResponse(400, '缺少必要參數：gameId');
  }
  if (!body.playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  if (body.x === undefined || body.x === null) {
    return createErrorResponse(400, '缺少必要參數：x');
  }
  if (body.y === undefined || body.y === null) {
    return createErrorResponse(400, '缺少必要參數：y');
  }
  if (body.made === undefined || body.made === null) {
    return createErrorResponse(400, '缺少必要參數：made');
  }

  // 驗證座標範圍（0-100）
  if (typeof body.x !== 'number' || body.x < 0 || body.x > 100) {
    return createErrorResponse(400, 'x 座標必須為 0-100 之間的數值');
  }
  if (typeof body.y !== 'number' || body.y < 0 || body.y > 100) {
    return createErrorResponse(400, 'y 座標必須為 0-100 之間的數值');
  }

  // 驗證投籃結果為 boolean
  if (typeof body.made !== 'boolean') {
    return createErrorResponse(400, 'made 必須為布林值（true/false）');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ShotLocations');
  var id = generateId();

  var headers = SHEET_DEFINITIONS.ShotLocations;
  var row = [];
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') {
      row.push(id);
    } else {
      row.push(body[col] !== undefined ? body[col] : '');
    }
  }

  sheet.appendRow(row);

  return createSuccessResponse({
    message: '投籃位置記錄成功',
    shotId: id
  }, false);
}

/**
 * 生成季後賽對陣表
 * 需求：8.3, 8.5
 * @param {Object} e - 事件物件
 * @param {Object} body - {seasonId, topN}
 */
function handleGeneratePlayoffs(e, body) {
  if (!body.seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }

  var topN = body.topN || 8;

  // 取得最終排名
  var standings = recalculateTeamStandings(body.seasonId);

  if (!standings || standings.length < 2) {
    return createErrorResponse(400, '球隊數量不足以生成季後賽');
  }

  // 取前 topN 名（若不足則取全部）
  var qualifiedTeams = standings.slice(0, Math.min(topN, standings.length));

  // 確保偶數支球隊
  if (qualifiedTeams.length % 2 !== 0) {
    qualifiedTeams = qualifiedTeams.slice(0, qualifiedTeams.length - 1);
  }

  if (qualifiedTeams.length < 2) {
    return createErrorResponse(400, '球隊數量不足以生成季後賽');
  }

  // 生成首輪對陣：1v8, 2v7, 3v6, 4v5
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gamesSheet = ss.getSheetByName('Games');
  var matchups = [];
  var n = qualifiedTeams.length;

  for (var i = 0; i < n / 2; i++) {
    var seed1 = i + 1;
    var seed2 = n - i;
    var homeTeam = qualifiedTeams[i];
    var awayTeam = qualifiedTeams[n - 1 - i];

    var gameId = generateId();
    var seedLabel = seed1 + 'v' + seed2;

    var headers = SHEET_DEFINITIONS.Games;
    var row = [];
    for (var h = 0; h < headers.length; h++) {
      var col = headers[h];
      if (col === 'id') row.push(gameId);
      else if (col === 'seasonId') row.push(body.seasonId);
      else if (col === 'homeTeamId') row.push(homeTeam.teamId);
      else if (col === 'awayTeamId') row.push(awayTeam.teamId);
      else if (col === 'type') row.push('playoff');
      else if (col === 'playoffRound') row.push(1);
      else if (col === 'playoffSeed') row.push(seedLabel);
      else if (col === 'status') row.push('scheduled');
      else if (col === 'homeScore' || col === 'awayScore') row.push(0);
      else row.push('');
    }

    gamesSheet.appendRow(row);

    matchups.push({
      gameId: gameId,
      round: 1,
      seed: seedLabel,
      homeTeamId: homeTeam.teamId,
      homeTeamName: homeTeam.teamName,
      awayTeamId: awayTeam.teamId,
      awayTeamName: awayTeam.teamName
    });
  }

  return createSuccessResponse({
    message: '季後賽對陣表生成成功',
    seasonId: body.seasonId,
    qualifiedTeams: qualifiedTeams.length,
    matchups: matchups
  }, false);
}

/**
 * 封存賽季
 * 需求：16.1, 16.2
 * @param {Object} e - 事件物件
 * @param {Object} body - {seasonId, awards{champion, playoffMvp, scoringLeader, reboundLeader, assistLeader, bestRookie}, summary, photos}
 */
function handleArchiveSeason(e, body) {
  if (!body.seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var seasonsSheet = ss.getSheetByName('Seasons');
  var archiveSheet = ss.getSheetByName('SeasonArchives');

  // 驗證賽季存在
  var seasonRowIdx = findRowIndex(seasonsSheet, 'id', body.seasonId);
  if (seasonRowIdx === -1) {
    return createErrorResponse(400, '找不到指定的賽季：' + body.seasonId);
  }

  // 更新賽季狀態為 completed
  var seasonHeaders = SHEET_DEFINITIONS.Seasons;
  var statusCol = seasonHeaders.indexOf('status') + 1;
  if (statusCol > 0) {
    seasonsSheet.getRange(seasonRowIdx, statusCol).setValue('completed');
  }

  // 生成歷史檔案
  var awards = body.awards || {};
  var id = generateId();

  var archiveHeaders = SHEET_DEFINITIONS.SeasonArchives;
  var row = [];
  for (var h = 0; h < archiveHeaders.length; h++) {
    var col = archiveHeaders[h];
    if (col === 'id') row.push(id);
    else if (col === 'seasonId') row.push(body.seasonId);
    else if (col === 'champion') row.push(awards.champion || '');
    else if (col === 'playoffMvp') row.push(awards.playoffMvp || '');
    else if (col === 'scoringLeader') row.push(awards.scoringLeader || '');
    else if (col === 'reboundLeader') row.push(awards.reboundLeader || '');
    else if (col === 'assistLeader') row.push(awards.assistLeader || '');
    else if (col === 'bestRookie') row.push(awards.bestRookie || '');
    else if (col === 'summary') row.push(body.summary || '');
    else if (col === 'photos') row.push(body.photos || '');
    else row.push('');
  }

  archiveSheet.appendRow(row);

  return createSuccessResponse({
    message: '賽季封存成功',
    archiveId: id,
    seasonId: body.seasonId
  }, false);
}

/**
 * 發佈公告
 * @param {Object} e - 事件物件
 * @param {Object} body - {title, content, pinned}
 */
function handleCreateAnnouncement(e, body) {
  if (!body.title) {
    return createErrorResponse(400, '缺少必要參數：title');
  }
  if (!body.content) {
    return createErrorResponse(400, '缺少必要參數：content');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Announcements');
  var id = generateId();
  var today = new Date().toISOString().split('T')[0];

  var headers = SHEET_DEFINITIONS.Announcements;
  var row = [];
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') row.push(id);
    else if (col === 'date') row.push(today);
    else if (col === 'title') row.push(body.title);
    else if (col === 'content') row.push(body.content);
    else if (col === 'pinned') row.push(body.pinned === true);
    else row.push('');
  }

  sheet.appendRow(row);

  return createSuccessResponse({
    message: '公告發佈成功',
    announcementId: id
  }, false);
}


// ============================================================
// Season / Team / Player CRUD 處理函數
// ============================================================

/**
 * 建立賽季
 * @param {Object} e
 * @param {Object} body - {name, startDate, endDate, playoffTopN, minGamesForRanking, status}
 */
function handleCreateSeason(e, body) {
  if (!body.name) {
    return createErrorResponse(400, '缺少必要參數：name');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Seasons');
  var id = generateId();
  var headers = SHEET_DEFINITIONS.Seasons;
  var row = [];
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') row.push(id);
    else if (col === 'playoffTopN') row.push(body.playoffTopN || 8);
    else if (col === 'minGamesForRanking') row.push(body.minGamesForRanking || 3);
    else if (col === 'status') row.push(body.status || 'active');
    else row.push(body[col] !== undefined ? body[col] : '');
  }
  sheet.appendRow(row);
  return createSuccessResponse({ message: '賽季建立成功', seasonId: id }, false);
}

/**
 * 更新賽季
 * @param {Object} e
 * @param {Object} body - {seasonId, ...fields}
 */
function handleUpdateSeason(e, body) {
  if (!body.seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Seasons');
  var rowIdx = findRowIndex(sheet, 'id', body.seasonId);
  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到指定的賽季：' + body.seasonId);
  }
  var headers = SHEET_DEFINITIONS.Seasons;
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') continue;
    if (body[col] !== undefined) {
      sheet.getRange(rowIdx, h + 1).setValue(body[col]);
    }
  }
  return createSuccessResponse({ message: '賽季更新成功', seasonId: body.seasonId }, false);
}

/**
 * 刪除賽季
 * @param {Object} e
 * @param {Object} body - {seasonId}
 */
function handleDeleteSeason(e, body) {
  if (!body.seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Seasons');
  var rowIdx = findRowIndex(sheet, 'id', body.seasonId);
  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到指定的賽季：' + body.seasonId);
  }
  sheet.deleteRow(rowIdx);
  return createSuccessResponse({ message: '賽季刪除成功', seasonId: body.seasonId }, false);
}

/**
 * 建立球隊
 * @param {Object} e
 * @param {Object} body - {seasonId, name, logo, captain, captainWhatsApp, description}
 */
function handleCreateTeam(e, body) {
  if (!body.seasonId) {
    return createErrorResponse(400, '缺少必要參數：seasonId');
  }
  if (!body.name) {
    return createErrorResponse(400, '缺少必要參數：name');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Teams');
  var id = generateId();
  var teamToken = generateId(); // 自動生成球隊管理 token
  body.teamToken = teamToken;
  var headers = SHEET_DEFINITIONS.Teams;
  var row = [];
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') row.push(id);
    else row.push(body[col] !== undefined ? body[col] : '');
  }
  sheet.appendRow(row);
  return createSuccessResponse({ message: '球隊建立成功', teamId: id, teamToken: teamToken }, false);
}

/**
 * 更新球隊
 * @param {Object} e
 * @param {Object} body - {teamId, ...fields}
 */
function handleUpdateTeam(e, body) {
  if (!body.teamId) {
    return createErrorResponse(400, '缺少必要參數：teamId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Teams');
  var rowIdx = findRowIndex(sheet, 'id', body.teamId);
  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到指定的球隊：' + body.teamId);
  }
  var headers = SHEET_DEFINITIONS.Teams;
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') continue;
    if (body[col] !== undefined) {
      sheet.getRange(rowIdx, h + 1).setValue(body[col]);
    }
  }
  return createSuccessResponse({ message: '球隊更新成功', teamId: body.teamId }, false);
}

/**
 * 刪除球隊
 * @param {Object} e
 * @param {Object} body - {teamId}
 */
function handleDeleteTeam(e, body) {
  if (!body.teamId) {
    return createErrorResponse(400, '缺少必要參數：teamId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Teams');
  var rowIdx = findRowIndex(sheet, 'id', body.teamId);
  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到指定的球隊：' + body.teamId);
  }
  sheet.deleteRow(rowIdx);
  return createSuccessResponse({ message: '球隊刪除成功', teamId: body.teamId }, false);
}

/**
 * 建立球員
 * @param {Object} e
 * @param {Object} body - {teamId, name, number, height, weight, photo, position}
 */
function handleCreatePlayer(e, body) {
  if (!body.teamId) {
    return createErrorResponse(400, '缺少必要參數：teamId');
  }
  if (!body.name) {
    return createErrorResponse(400, '缺少必要參數：name');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Players');
  var id = generateId();
  var headers = SHEET_DEFINITIONS.Players;
  var row = [];
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') row.push(id);
    else row.push(body[col] !== undefined ? body[col] : '');
  }
  sheet.appendRow(row);
  return createSuccessResponse({ message: '球員建立成功', playerId: id }, false);
}

/**
 * 更新球員
 * @param {Object} e
 * @param {Object} body - {playerId, ...fields}
 */
function handleUpdatePlayer(e, body) {
  if (!body.playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Players');
  var rowIdx = findRowIndex(sheet, 'id', body.playerId);
  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到指定的球員：' + body.playerId);
  }
  var headers = SHEET_DEFINITIONS.Players;
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') continue;
    if (body[col] !== undefined) {
      sheet.getRange(rowIdx, h + 1).setValue(body[col]);
    }
  }
  return createSuccessResponse({ message: '球員更新成功', playerId: body.playerId }, false);
}

/**
 * 刪除球員
 * @param {Object} e
 * @param {Object} body - {playerId}
 */
function handleDeletePlayer(e, body) {
  if (!body.playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Players');
  var rowIdx = findRowIndex(sheet, 'id', body.playerId);
  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到指定的球員：' + body.playerId);
  }
  sheet.deleteRow(rowIdx);
  return createSuccessResponse({ message: '球員刪除成功', playerId: body.playerId }, false);
}

// ============================================================
// 公開球隊自助管理 API（使用 teamToken 驗證）
// ============================================================

/**
 * 透過 teamToken 驗證並取得球隊資料
 * @param {string} token - 球隊管理 token
 * @returns {{team: Object, teamRow: number}|null}
 */
function validateTeamToken(token) {
  if (!token) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Teams');
  var teams = sheetToObjects(sheet);
  for (var i = 0; i < teams.length; i++) {
    if (teams[i].teamToken === token) {
      return { team: teams[i], sheet: sheet };
    }
  }
  return null;
}

/**
 * GET ?action=teamByToken&token=X
 * 公開端點：透過 token 取得球隊資料及球員名單
 */
function handleGetTeamByToken(e) {
  var token = e && e.parameter ? e.parameter.token : null;
  if (!token) {
    return createErrorResponse(400, '缺少必要參數：token');
  }
  var result = validateTeamToken(token);
  if (!result) {
    return createErrorResponse(400, '無效的球隊連結');
  }
  var team = result.team;
  // 不回傳 teamToken 給前端
  var safeTeam = {
    id: team.id, seasonId: team.seasonId, name: team.name,
    logo: team.logo, captain: team.captain,
    captainWhatsApp: team.captainWhatsApp, description: team.description,
    jerseyHome: team.jerseyHome, jerseyAway: team.jerseyAway
  };
  // 取得球員名單
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var playersSheet = ss.getSheetByName('Players');
  var allPlayers = sheetToObjects(playersSheet);
  var teamPlayers = allPlayers.filter(function(p) { return p.teamId === team.id; });
  return createSuccessResponse({ team: safeTeam, players: teamPlayers }, false);
}

/**
 * POST publicUpdateTeam — 球隊自助更新資料
 * @param {Object} body - {teamToken, name, logo, captain, captainWhatsApp, description}
 */
function handlePublicUpdateTeam(e, body) {
  if (!body.teamToken) {
    return createErrorResponse(400, '缺少必要參數：teamToken');
  }
  var result = validateTeamToken(body.teamToken);
  if (!result) {
    return createErrorResponse(401, '無效的球隊連結');
  }
  var sheet = result.sheet;
  var team = result.team;
  var rowIdx = findRowIndex(sheet, 'id', team.id);
  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到球隊');
  }
  var headers = SHEET_DEFINITIONS.Teams;
  var allowedFields = ['name', 'logo', 'captain', 'captainWhatsApp', 'description', 'jerseyHome', 'jerseyAway'];
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (allowedFields.indexOf(col) !== -1 && body[col] !== undefined) {
      sheet.getRange(rowIdx, h + 1).setValue(body[col]);
    }
  }
  return createSuccessResponse({ message: '球隊資料更新成功' }, false);
}

/**
 * POST publicCreatePlayer — 球隊自助新增球員
 * @param {Object} body - {teamToken, name, number, height, weight, position}
 */
function handlePublicCreatePlayer(e, body) {
  if (!body.teamToken) {
    return createErrorResponse(400, '缺少必要參數：teamToken');
  }
  var result = validateTeamToken(body.teamToken);
  if (!result) {
    return createErrorResponse(401, '無效的球隊連結');
  }
  if (!body.name) {
    return createErrorResponse(400, '缺少必要參數：name');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Players');
  var id = generateId();
  var headers = SHEET_DEFINITIONS.Players;
  var row = [];
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (col === 'id') row.push(id);
    else if (col === 'teamId') row.push(result.team.id);
    else row.push(body[col] !== undefined ? body[col] : '');
  }
  sheet.appendRow(row);
  return createSuccessResponse({ message: '球員新增成功', playerId: id }, false);
}

/**
 * POST publicUpdatePlayer — 球隊自助更新球員
 * @param {Object} body - {teamToken, playerId, name, number, height, weight, position}
 */
function handlePublicUpdatePlayer(e, body) {
  if (!body.teamToken) {
    return createErrorResponse(400, '缺少必要參數：teamToken');
  }
  var result = validateTeamToken(body.teamToken);
  if (!result) {
    return createErrorResponse(401, '無效的球隊連結');
  }
  if (!body.playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  // 驗證球員屬於該球隊
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Players');
  var players = sheetToObjects(sheet);
  var player = null;
  for (var i = 0; i < players.length; i++) {
    if (players[i].id === body.playerId) { player = players[i]; break; }
  }
  if (!player || player.teamId !== result.team.id) {
    return createErrorResponse(400, '無權修改此球員');
  }
  var rowIdx = findRowIndex(sheet, 'id', body.playerId);
  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到球員');
  }
  var headers = SHEET_DEFINITIONS.Players;
  var allowedFields = ['name', 'number', 'height', 'weight', 'photo', 'position'];
  for (var h = 0; h < headers.length; h++) {
    var col = headers[h];
    if (allowedFields.indexOf(col) !== -1 && body[col] !== undefined) {
      sheet.getRange(rowIdx, h + 1).setValue(body[col]);
    }
  }
  return createSuccessResponse({ message: '球員更新成功' }, false);
}

/**
 * POST publicDeletePlayer — 球隊自助刪除球員
 * @param {Object} body - {teamToken, playerId}
 */
function handlePublicDeletePlayer(e, body) {
  if (!body.teamToken) {
    return createErrorResponse(400, '缺少必要參數：teamToken');
  }
  var result = validateTeamToken(body.teamToken);
  if (!result) {
    return createErrorResponse(401, '無效的球隊連結');
  }
  if (!body.playerId) {
    return createErrorResponse(400, '缺少必要參數：playerId');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Players');
  var players = sheetToObjects(sheet);
  var player = null;
  for (var i = 0; i < players.length; i++) {
    if (players[i].id === body.playerId) { player = players[i]; break; }
  }
  if (!player || player.teamId !== result.team.id) {
    return createErrorResponse(400, '無權刪除此球員');
  }
  var rowIdx = findRowIndex(sheet, 'id', body.playerId);
  if (rowIdx === -1) {
    return createErrorResponse(400, '找不到球員');
  }
  sheet.deleteRow(rowIdx);
  return createSuccessResponse({ message: '球員刪除成功' }, false);
}
