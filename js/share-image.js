/**
 * ALL-IN Basketball League — 分享圖生成器
 * 使用 HTML Canvas API 繪製 1080×1080 像素社交媒體分享圖片
 * 需求：13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */
var ShareImageGenerator = (function () {
  'use strict';

  function _fmtDate(raw) { return (typeof Utils !== 'undefined' && Utils.formatDateWithDay) ? Utils.formatDateWithDay(raw) : (raw || ''); }
  /** Canvas 尺寸 */
  var WIDTH = 1080;
  var HEIGHT = 1080;

  /** 品牌配色 */
  var BRAND = {
    primary: '#1a1a2e',
    primaryLight: '#16213e',
    secondary: '#e94560',
    accent: '#f5a623',
    accentLight: '#ffd166',
    white: '#ffffff',
    textLight: '#e8e8f0',
    textMuted: '#a0a0b8',
    surface: '#222244',
    gold: '#f5a623'
  };

  /** 可用模板 */
  var templates = ['classic', 'modern', 'minimal'];

  // ─── 模板繪製函數 ───

  /**
   * Classic 模板：深色背景 + 金色文字，正式風格
   */
  function _drawClassic(ctx, gameData) {
    // 背景
    ctx.fillStyle = BRAND.primary;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // 頂部金色裝飾線
    var grad = ctx.createLinearGradient(0, 0, WIDTH, 0);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.2, BRAND.gold);
    grad.addColorStop(0.8, BRAND.gold);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, 6);

    // 底部金色裝飾線
    ctx.fillRect(0, HEIGHT - 6, WIDTH, 6);

    // 聯賽標誌 & 標題
    _drawLeagueBranding(ctx, BRAND.gold, BRAND.textLight, 80);

    // 比賽日期
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = BRAND.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText(_fmtDate(gameData.date), WIDTH / 2, 200);

    // 對陣雙方隊名
    _drawTeamNames(ctx, gameData, BRAND.white, BRAND.textMuted, 320);

    // 隊徽
    _drawTeamLogos(ctx, gameData, 320);

    // 比分
    _drawScore(ctx, gameData, BRAND.gold, 480);

    // 分隔線
    var sepGrad = ctx.createLinearGradient(200, 0, WIDTH - 200, 0);
    sepGrad.addColorStop(0, 'transparent');
    sepGrad.addColorStop(0.3, BRAND.gold + '66');
    sepGrad.addColorStop(0.7, BRAND.gold + '66');
    sepGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sepGrad;
    ctx.fillRect(200, 560, WIDTH - 400, 2);

    // MVP 區域
    _drawMVP(ctx, gameData, BRAND.gold, BRAND.white, BRAND.textMuted, 640);

    // 底部品牌
    _drawFooterBrand(ctx, BRAND.textMuted, BRAND.gold);
  }

  /**
   * Modern 模板：漸層背景 + 白色文字，現代風格
   */
  function _drawModern(ctx, gameData) {
    // 漸層背景
    var bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bgGrad.addColorStop(0, '#0f0c29');
    bgGrad.addColorStop(0.5, '#302b63');
    bgGrad.addColorStop(1, '#24243e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // 裝飾圓形
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(WIDTH * 0.85, HEIGHT * 0.15, 300, 0, Math.PI * 2);
    ctx.fillStyle = BRAND.secondary;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(WIDTH * 0.1, HEIGHT * 0.85, 250, 0, Math.PI * 2);
    ctx.fillStyle = BRAND.accent;
    ctx.fill();
    ctx.globalAlpha = 1;

    // 頂部漸層條
    var topGrad = ctx.createLinearGradient(0, 0, WIDTH, 0);
    topGrad.addColorStop(0, BRAND.secondary);
    topGrad.addColorStop(1, BRAND.accent);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, WIDTH, 8);

    // 聯賽標誌 & 標題
    _drawLeagueBranding(ctx, BRAND.white, BRAND.textLight, 80);

    // 比賽日期
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = BRAND.textLight;
    ctx.textAlign = 'center';
    ctx.fillText(_fmtDate(gameData.date), WIDTH / 2, 200);

    // 對陣雙方隊名
    _drawTeamNames(ctx, gameData, BRAND.white, BRAND.textLight, 320);

    // 隊徽
    _drawTeamLogos(ctx, gameData, 320);

    // 比分
    _drawScore(ctx, gameData, BRAND.white, 480);

    // 分隔線
    var sepGrad = ctx.createLinearGradient(200, 0, WIDTH - 200, 0);
    sepGrad.addColorStop(0, BRAND.secondary);
    sepGrad.addColorStop(1, BRAND.accent);
    ctx.fillStyle = sepGrad;
    ctx.fillRect(240, 560, WIDTH - 480, 3);

    // MVP 區域
    _drawMVP(ctx, gameData, BRAND.white, BRAND.white, BRAND.textLight, 640);

    // 底部品牌
    _drawFooterBrand(ctx, BRAND.textLight, BRAND.white);
  }

  /**
   * Minimal 模板：白色背景 + 品牌色文字，簡約風格
   */
  function _drawMinimal(ctx, gameData) {
    // 白色背景
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // 頂部品牌色條
    ctx.fillStyle = BRAND.secondary;
    ctx.fillRect(0, 0, WIDTH, 8);

    // 聯賽標誌 & 標題
    _drawLeagueBranding(ctx, BRAND.primary, '#555555', 80);

    // 比賽日期
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText(_fmtDate(gameData.date), WIDTH / 2, 200);

    // 對陣雙方隊名
    _drawTeamNames(ctx, gameData, BRAND.primary, '#666666', 320);

    // 隊徽
    _drawTeamLogos(ctx, gameData, 320);

    // 比分
    _drawScore(ctx, gameData, BRAND.secondary, 480);

    // 分隔線
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(240, 560, WIDTH - 480, 2);

    // MVP 區域
    _drawMVP(ctx, gameData, BRAND.secondary, BRAND.primary, '#888888', 640);

    // 底部品牌
    _drawFooterBrand(ctx, '#aaaaaa', BRAND.secondary);
  }

  // ─── 共用繪製輔助函數 ───

  function _drawLeagueBranding(ctx, titleColor, subtitleColor, y) {
    // 聯賽標誌圓形佔位
    ctx.save();
    ctx.beginPath();
    ctx.arc(WIDTH / 2, y, 30, 0, Math.PI * 2);
    ctx.fillStyle = titleColor;
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // 標誌文字
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = titleColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ALL-IN', WIDTH / 2, y);

    // 副標題
    ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = subtitleColor;
    ctx.fillText('Basketball League', WIDTH / 2, y + 40);
    ctx.textBaseline = 'alphabetic';
  }

  function _drawTeamNames(ctx, gameData, mainColor, subColor, y) {
    var homeTeam = gameData.homeTeamName || 'Home';
    var awayTeam = gameData.awayTeamName || 'Away';

    ctx.textAlign = 'center';

    // 主隊名
    ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = mainColor;
    ctx.fillText(_truncateText(ctx, homeTeam, 380), WIDTH * 0.25, y);

    // VS
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = subColor;
    ctx.fillText('VS', WIDTH / 2, y);

    // 客隊名
    ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = mainColor;
    ctx.fillText(_truncateText(ctx, awayTeam, 380), WIDTH * 0.75, y);
  }

  function _drawTeamLogos(ctx, gameData, centerY) {
    // 隊徽佔位圓形（如果沒有實際圖片）
    var logoY = centerY - 100;
    var logoRadius = 50;

    // 主隊隊徽
    if (gameData.homeTeamLogoImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(WIDTH * 0.25, logoY, logoRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(gameData.homeTeamLogoImg, WIDTH * 0.25 - logoRadius, logoY - logoRadius, logoRadius * 2, logoRadius * 2);
      ctx.restore();
    } else {
      _drawLogoPlaceholder(ctx, WIDTH * 0.25, logoY, logoRadius);
    }

    // 客隊隊徽
    if (gameData.awayTeamLogoImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(WIDTH * 0.75, logoY, logoRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(gameData.awayTeamLogoImg, WIDTH * 0.75 - logoRadius, logoY - logoRadius, logoRadius * 2, logoRadius * 2);
      ctx.restore();
    } else {
      _drawLogoPlaceholder(ctx, WIDTH * 0.75, logoY, logoRadius);
    }
  }

  function _drawLogoPlaceholder(ctx, cx, cy, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = BRAND.surface;
    ctx.fill();
    ctx.strokeStyle = BRAND.accent + '44';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 籃球圖示
    ctx.font = '36px -apple-system, sans-serif';
    ctx.fillStyle = BRAND.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏀', cx, cy);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function _drawScore(ctx, gameData, color, y) {
    var homeScore = gameData.homeScore != null ? String(gameData.homeScore) : '0';
    var awayScore = gameData.awayScore != null ? String(gameData.awayScore) : '0';

    ctx.textAlign = 'center';
    ctx.font = 'bold 96px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(homeScore, WIDTH * 0.3, y);

    // 冒號分隔
    ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillText(':', WIDTH / 2, y - 8);

    ctx.font = 'bold 96px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillText(awayScore, WIDTH * 0.7, y);

    // FINAL 標籤
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillText('FINAL', WIDTH / 2, y + 40);
  }

  function _drawMVP(ctx, gameData, accentColor, nameColor, dataColor, y) {
    if (!gameData.mvpName) return;

    // MVP 標籤
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText('⭐ MVP ⭐', WIDTH / 2, y);

    // MVP 球員姓名
    ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = nameColor;
    ctx.fillText(_truncateText(ctx, gameData.mvpName, 600), WIDTH / 2, y + 60);

    // 關鍵數據
    var stats = [];
    if (gameData.mvpPts != null) stats.push(gameData.mvpPts + ' PTS');
    if (gameData.mvpReb != null) stats.push(gameData.mvpReb + ' REB');
    if (gameData.mvpAst != null) stats.push(gameData.mvpAst + ' AST');

    if (stats.length > 0) {
      ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
      ctx.fillStyle = dataColor;
      ctx.fillText(stats.join('  |  '), WIDTH / 2, y + 115);
    }
  }

  function _drawFooterBrand(ctx, textColor, accentColor) {
    var footerY = HEIGHT - 60;

    ctx.textAlign = 'center';
    ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
    ctx.fillStyle = textColor;
    ctx.fillText('ALL-IN Basketball League', WIDTH / 2, footerY);

    // 底部裝飾小點
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(WIDTH / 2, footerY + 20, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 截斷過長文字
   */
  function _truncateText(ctx, text, maxWidth) {
    if (!text) return '';
    var measured = ctx.measureText(text);
    if (measured.width <= maxWidth) return text;
    var truncated = text;
    while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '…';
  }

  // ─── 公開 API ───

  /**
   * 生成分享圖
   * @param {Object} gameData - 比賽數據
   * @param {string} gameData.date - 比賽日期
   * @param {string} gameData.homeTeamName - 主隊名
   * @param {string} gameData.awayTeamName - 客隊名
   * @param {string} [gameData.homeTeamLogo] - 主隊隊徽 URL
   * @param {string} [gameData.awayTeamLogo] - 客隊隊徽 URL
   * @param {number} gameData.homeScore - 主隊得分
   * @param {number} gameData.awayScore - 客隊得分
   * @param {string} [gameData.mvpName] - MVP 球員姓名
   * @param {number} [gameData.mvpPts] - MVP 得分
   * @param {number} [gameData.mvpReb] - MVP 籃板
   * @param {number} [gameData.mvpAst] - MVP 助攻
   * @param {string} template - 模板名稱 ('classic'|'modern'|'minimal')
   * @param {Object} [options] - 額外選項
   * @returns {Promise<HTMLCanvasElement>}
   */
  function generate(gameData, template, options) {
    return _loadTeamLogos(gameData).then(function (data) {
      var canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      var ctx = canvas.getContext('2d');

      switch (template) {
        case 'modern':
          _drawModern(ctx, data);
          break;
        case 'minimal':
          _drawMinimal(ctx, data);
          break;
        case 'classic':
        default:
          _drawClassic(ctx, data);
          break;
      }

      return canvas;
    });
  }

  /**
   * 載入隊徽圖片
   */
  function _loadTeamLogos(gameData) {
    var data = Object.assign({}, gameData);
    var promises = [];

    if (gameData.homeTeamLogo) {
      promises.push(
        _loadImage(gameData.homeTeamLogo)
          .then(function (img) { data.homeTeamLogoImg = img; })
          .catch(function () { data.homeTeamLogoImg = null; })
      );
    }
    if (gameData.awayTeamLogo) {
      promises.push(
        _loadImage(gameData.awayTeamLogo)
          .then(function (img) { data.awayTeamLogoImg = img; })
          .catch(function () { data.awayTeamLogoImg = null; })
      );
    }

    return Promise.all(promises).then(function () { return data; });
  }

  /**
   * 載入圖片
   */
  function _loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Failed to load image: ' + src)); };
      img.src = src;
    });
  }

  /**
   * 預覽分享圖至指定容器
   * @param {HTMLCanvasElement} canvas - 生成的 Canvas
   * @param {string} containerId - 容器元素 ID
   */
  function preview(canvas, containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    var previewCanvas = canvas.cloneNode(false);
    previewCanvas.getContext('2d').drawImage(canvas, 0, 0);
    previewCanvas.style.width = '100%';
    previewCanvas.style.height = 'auto';
    previewCanvas.style.maxWidth = '540px';
    previewCanvas.style.borderRadius = '8px';
    container.appendChild(previewCanvas);
  }

  /**
   * 下載分享圖
   * @param {HTMLCanvasElement} canvas - 生成的 Canvas
   * @param {string} [format='png'] - 格式 ('png'|'jpeg')
   * @param {string} [filename] - 檔案名稱
   */
  function download(canvas, format, filename) {
    format = format || 'png';
    var mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    var ext = format === 'jpeg' ? '.jpg' : '.png';
    var defaultName = 'allin-game-share' + ext;
    var name = filename || defaultName;

    var dataUrl = canvas.toDataURL(mimeType, 0.95);
    var link = document.createElement('a');
    link.download = name;
    link.href = dataUrl;
    link.click();
  }

  /**
   * 使用 Gemini AI 生成風格化圖片（可選功能）
   * @param {Object} gameData - 比賽數據
   * @param {string} style - 風格描述
   * @returns {Promise<Blob>}
   */
  function generateWithGemini(gameData, style) {
    // Gemini AI 整合為可選功能，需要 API Key 設定
    return Promise.reject(new Error('Gemini AI 功能尚未啟用。請在設定中配置 Gemini API Key。'));
  }

  // 公開 API
  return {
    templates: templates,
    generate: generate,
    preview: preview,
    download: download,
    generateWithGemini: generateWithGemini
  };
})();

// Node.js / 測試環境匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShareImageGenerator;
}
