/**
 * ALL-IN Basketball League — Google Apps Script Backend
 * API 路由層、授權機制、快取管理
 */

// ============================================================
// 常量
// ============================================================
var CACHE_TTL = 300;

var VALID_GET_ACTIONS = [
  'seasons', 'teams', 'players', 'games', 'boxscore',
  'standings', 'leaders', 'playerProfile', 'teamProfile',
  'schedule', 'playoffs', 'shotchart', 'advancedStats',
  'achievements', 'archive', 'announcements'
];

var VALID_POST_ACTIONS = [
  'submitBoxScore', 'updateBoxScore', 'createGame', 'updateGame',
  'submitShotLocation', 'generatePlayoffs', 'archiveSeason',
  'createAnnouncement', 'updateAnnouncement', 'deleteAnnouncement',
  'cancelGame', 'deleteGame',
  'createTeam', 'updateTeam', 'deleteTeam'
];

// ============================================================
// 回應工具
// ============================================================
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

// ============================================================
// 授權驗證
// ============================================================
function validateApiKey(e) {
  var storedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!storedKey) return false;
  var providedKey = null;
  if (e && e.parameter && e.parameter.apiKey) {
    providedKey = e.parameter.apiKey;
  }
  if (!providedKey && e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (body.apiKey) providedKey = body.apiKey;
    } catch (err) { /* ignore */ }
  }
  return providedKey === storedKey;
}

// ============================================================
// 快取管理
// ============================================================
function getCachedResponse(cacheKey) {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    return null;
  } catch (err) { return null; }
}

function setCachedResponse(cacheKey, data, ttl) {
  try {
    var cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify(data), ttl || CACHE_TTL);
  } catch (err) { /* ignore */ }
}

function buildCacheKey(action, params) {
  if (!params) return action;
  if (params.gameId) return action + '_' + params.gameId;
  if (params.playerId) return action + '_' + params.playerId;
  if (params.teamId) return action + '_' + params.teamId;
  if (params.seasonId) return action + '_' + params.seasonId;
  return action;
}

function clearRelatedCache(action, params) {
  try {
    var cache = CacheService.getScriptCache();
    var keysToRemove = [];

    if (action === 'submitBoxScore' || action === 'updateBoxScore') {
      var gameId = params && params.gameId ? params.gameId : '';
      var seasonId = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('boxscore_' + gameId, 'standings_' + seasonId, 'leaders_' + seasonId);
      keysToRemove.push('standings', 'leaders', 'games_' + seasonId, 'games', 'announcements');
      if (params && params.entries && params.entries.length > 0) {
        for (var i = 0; i < params.entries.length; i++) {
          var entry = params.entries[i];
          if (entry.playerId) {
            keysToRemove.push('playerProfile_' + entry.playerId, 'advancedStats_' + entry.playerId, 'achievements_' + entry.playerId);
          }
          if (entry.teamId) keysToRemove.push('teamProfile_' + entry.teamId);
        }
      }
    } else if (action === 'createGame' || action === 'updateGame' || action === 'cancelGame' || action === 'deleteGame') {
      var seasonId2 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('games_' + seasonId2, 'games', 'schedule_' + seasonId2, 'schedule');
    } else if (action === 'submitShotLocation') {
      keysToRemove.push('shotchart_' + (params && params.playerId || ''), 'shotchart_' + (params && params.gameId || ''));
    } else if (action === 'generatePlayoffs') {
      var seasonId3 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('playoffs_' + seasonId3, 'playoffs');
    } else if (action === 'archiveSeason') {
      var seasonId4 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('archive_' + seasonId4, 'archive', 'seasons');
    } else if (action === 'createAnnouncement' || action === 'updateAnnouncement' || action === 'deleteAnnouncement') {
      keysToRemove.push('announcements');
    }

    if (keysToRemove.length > 0) cache.removeAll(keysToRemove);
  } catch (err) { /* ignore */ }
}

// ============================================================
// GET 處理器
// ============================================================
function handleGetSeasons(e) { return createSuccessResponse([], false); }
function handleGetTeams(e) { return createSuccessResponse([], false); }
function handleGetPlayers(e) { return createSuccessResponse([], false); }
function handleGetGames(e) { return createSuccessResponse([], false); }
function handleGetBoxScore(e) { return createSuccessResponse({}, false); }
function handleGetStandings(e) { return createSuccessResponse([], false); }
function handleGetLeaders(e) { return createSuccessResponse([], false); }
function handleGetPlayerProfile(e) { return createSuccessResponse({}, false); }
function handleGetTeamProfile(e) { return createSuccessResponse({}, false); }
function handleGetSchedule(e) { return createSuccessResponse([], false); }
function handleGetPlayoffs(e) { return createSuccessResponse({}, false); }
function handleGetShotChart(e) { return createSuccessResponse([], false); }
function handleGetAdvancedStats(e) { return createSuccessResponse({}, false); }
function handleGetAchievements(e) { return createSuccessResponse([], false); }
function handleGetArchive(e) { return createSuccessResponse({}, false); }
function handleGetAnnouncements(e) { return createSuccessResponse([], false); }

// ============================================================
// POST 處理器
// ============================================================
function handleSubmitBoxScore(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) return createErrorResponse(400, '缺少必要參數：entries');
  var validation = validateBoxScore(body.entries);
  if (!validation.valid) return createErrorResponse(400, '數據驗證失敗：' + JSON.stringify(validation.errors));
  return createSuccessResponse({ message: 'Box Score 提交成功', gameId: body.gameId, insertedCount: body.entries.length }, false);
}

function handleUpdateBoxScore(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  if (!body.playerId) return createErrorResponse(400, '缺少必要參數：playerId');
  if (!body.field) return createErrorResponse(400, '缺少必要參數：field');
  if (body.value === undefined || body.value === null) return createErrorResponse(400, '缺少必要參數：value');
  var editableFields = ['pts', 'reb', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'to', 'fouls'];
  if (editableFields.indexOf(body.field) === -1) return createErrorResponse(400, '無效的欄位名稱：' + body.field);
  if (typeof body.value !== 'number' || !Number.isInteger(body.value) || body.value < 0) return createErrorResponse(400, body.field + ' 必須為非負整數');
  return createSuccessResponse({ message: 'Box Score 修改成功', gameId: body.gameId, field: body.field, newValue: body.value }, false);
}

function handleCreateGame(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  if (!body.date) return createErrorResponse(400, '缺少必要參數：date');
  if (!body.homeTeamId) return createErrorResponse(400, '缺少必要參數：homeTeamId');
  if (!body.awayTeamId) return createErrorResponse(400, '缺少必要參數：awayTeamId');
  return createSuccessResponse({ message: '比賽建立成功', gameId: 'new-game-id' }, false);
}

function handleUpdateGame(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  return createSuccessResponse({ message: '比賽更新成功', gameId: body.gameId }, false);
}

function handleCancelGame(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  // TODO: Update the game row status to 'cancelled' in the spreadsheet
  // var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Games');
  // Find row by gameId and set status column to 'cancelled'
  return createSuccessResponse({ message: '比賽已取消', gameId: body.gameId }, false);
}

function handleSubmitShotLocation(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  if (!body.playerId) return createErrorResponse(400, '缺少必要參數：playerId');
  if (body.x === undefined || body.x === null) return createErrorResponse(400, '缺少必要參數：x');
  if (body.y === undefined || body.y === null) return createErrorResponse(400, '缺少必要參數：y');
  if (body.made === undefined || body.made === null) return createErrorResponse(400, '缺少必要參數：made');
  if (typeof body.x !== 'number' || body.x < 0 || body.x > 100) return createErrorResponse(400, 'x 座標必須為 0-100 之間的數值');
  if (typeof body.y !== 'number' || body.y < 0 || body.y > 100) return createErrorResponse(400, 'y 座標必須為 0-100 之間的數值');
  if (typeof body.made !== 'boolean') return createErrorResponse(400, 'made 必須為布林值（true/false）');
  return createSuccessResponse({ message: '投籃位置記錄成功', shotId: 'new-shot-id' }, false);
}

function handleGeneratePlayoffs(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  return createSuccessResponse({ message: '季後賽對陣表生成成功', seasonId: body.seasonId }, false);
}

function handleArchiveSeason(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  return createSuccessResponse({ message: '賽季封存成功', seasonId: body.seasonId }, false);
}

function handleCreateAnnouncement(e, body) {
  if (!body.title) return createErrorResponse(400, '缺少必要參數：title');
  if (!body.content) return createErrorResponse(400, '缺少必要參數：content');
  return createSuccessResponse({ message: '公告發佈成功', announcementId: 'new-ann-id' }, false);
}

function handleUpdateAnnouncement(e, body) {
  if (!body.announcementId) return createErrorResponse(400, '缺少必要參數：announcementId');
  return createSuccessResponse({ message: '公告更新成功', announcementId: body.announcementId }, false);
}

function handleDeleteAnnouncement(e, body) {
  if (!body.announcementId) return createErrorResponse(400, '缺少必要參數：announcementId');
  return createSuccessResponse({ message: '公告已刪除', announcementId: body.announcementId }, false);
}

function handleDeleteGame(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  return createSuccessResponse({ message: '比賽已刪除', gameId: body.gameId }, false);
}

function handleCreateTeam(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  if (!body.name) return createErrorResponse(400, '缺少必要參數：name');
  return createSuccessResponse({ message: '球隊建立成功', teamId: 'new-team-id' }, false);
}

function handleUpdateTeam(e, body) {
  if (!body.teamId) return createErrorResponse(400, '缺少必要參數：teamId');
  return createSuccessResponse({ message: '球隊更新成功', teamId: body.teamId }, false);
}

function handleDeleteTeam(e, body) {
  if (!body.teamId) return createErrorResponse(400, '缺少必要參數：teamId');
  return createSuccessResponse({ message: '球隊已刪除', teamId: body.teamId }, false);
}

// ============================================================
// Box Score 驗證
// ============================================================
function validateBoxScore(entries) {
  var errors = [];
  var statFields = ['pts', 'reb', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'to', 'fouls'];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.playerId) { errors.push('第 ' + (i + 1) + ' 筆缺少 playerId'); continue; }
    if (!entry.teamId) { errors.push('第 ' + (i + 1) + ' 筆缺少 teamId'); continue; }
    for (var j = 0; j < statFields.length; j++) {
      var field = statFields[j];
      if (entry[field] !== undefined && entry[field] !== null) {
        if (typeof entry[field] !== 'number' || !Number.isInteger(entry[field]) || entry[field] < 0) {
          errors.push(entry.playerId + ' 的 ' + field + ' 必須為非負整數');
        }
      }
    }
    if (entry.fgm !== undefined && entry.fga !== undefined && entry.fgm > entry.fga) {
      errors.push(entry.playerId + ': FGM 不能大於 FGA');
    }
    if (entry.tpm !== undefined && entry.tpa !== undefined && entry.tpm > entry.tpa) {
      errors.push(entry.playerId + ': 3PM 不能大於 3PA');
    }
    if (entry.ftm !== undefined && entry.fta !== undefined && entry.ftm > entry.fta) {
      errors.push(entry.playerId + ': FTM 不能大於 FTA');
    }
  }
  return { valid: errors.length === 0, errors: errors };
}

// ============================================================
// doGet — 公開 API
// ============================================================
function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;
    if (!action) return createErrorResponse(400, '缺少必要參數：action');
    if (VALID_GET_ACTIONS.indexOf(action) === -1) return createErrorResponse(400, '無效的請求動作：' + action);

    var cacheKey = buildCacheKey(action, e.parameter);
    var cached = getCachedResponse(cacheKey);
    if (cached) return createSuccessResponse(cached, true);

    var result;
    switch (action) {
      case 'seasons': result = handleGetSeasons(e); break;
      case 'teams': result = handleGetTeams(e); break;
      case 'players': result = handleGetPlayers(e); break;
      case 'games': result = handleGetGames(e); break;
      case 'boxscore': result = handleGetBoxScore(e); break;
      case 'standings': result = handleGetStandings(e); break;
      case 'leaders': result = handleGetLeaders(e); break;
      case 'playerProfile': result = handleGetPlayerProfile(e); break;
      case 'teamProfile': result = handleGetTeamProfile(e); break;
      case 'schedule': result = handleGetSchedule(e); break;
      case 'playoffs': result = handleGetPlayoffs(e); break;
      case 'shotchart': result = handleGetShotChart(e); break;
      case 'advancedStats': result = handleGetAdvancedStats(e); break;
      case 'achievements': result = handleGetAchievements(e); break;
      case 'archive': result = handleGetArchive(e); break;
      case 'announcements': result = handleGetAnnouncements(e); break;
      default: return createErrorResponse(400, '無效的請求動作：' + action);
    }
    return result;
  } catch (err) {
    return createErrorResponse(500, '伺服器內部錯誤，請稍後重試');
  }
}

// ============================================================
// doPost — 需授權 API
// ============================================================
function doPost(e) {
  try {
    if (!validateApiKey(e)) return createErrorResponse(401, '未授權：缺少或無效的 API Key');
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (err) {
      return createErrorResponse(400, '參數格式錯誤：請求體必須為有效的 JSON');
    }
    var action = body.action;
    if (!action) return createErrorResponse(400, '缺少必要參數：action');
    if (VALID_POST_ACTIONS.indexOf(action) === -1) return createErrorResponse(400, '無效的請求動作：' + action);

    var result;
    switch (action) {
      case 'submitBoxScore': result = handleSubmitBoxScore(e, body); break;
      case 'updateBoxScore': result = handleUpdateBoxScore(e, body); break;
      case 'createGame': result = handleCreateGame(e, body); break;
      case 'updateGame': result = handleUpdateGame(e, body); break;
      case 'cancelGame': result = handleCancelGame(e, body); break;
      case 'deleteGame': result = handleDeleteGame(e, body); break;
      case 'submitShotLocation': result = handleSubmitShotLocation(e, body); break;
      case 'generatePlayoffs': result = handleGeneratePlayoffs(e, body); break;
      case 'archiveSeason': result = handleArchiveSeason(e, body); break;
      case 'createAnnouncement': result = handleCreateAnnouncement(e, body); break;
      case 'updateAnnouncement': result = handleUpdateAnnouncement(e, body); break;
      case 'deleteAnnouncement': result = handleDeleteAnnouncement(e, body); break;
      case 'createTeam': result = handleCreateTeam(e, body); break;
      case 'updateTeam': result = handleUpdateTeam(e, body); break;
      case 'deleteTeam': result = handleDeleteTeam(e, body); break;
      default: return createErrorResponse(400, '無效的請求動作：' + action);
    }

    // POST 成功後清除相關快取
    try {
      var responseBody = JSON.parse(result.getContent());
      if (responseBody.status === 'success') clearRelatedCache(action, body);
    } catch (cacheErr) { /* ignore */ }

    return result;
  } catch (err) {
    return createErrorResponse(500, '伺服器內部錯誤，請稍後重試');
  }
}
