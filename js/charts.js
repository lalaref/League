/**
 * ALL-IN Basketball League — Chart.js 圖表封裝模組
 * 封裝 Chart.js 初始化邏輯，提供折線圖、雷達圖、投籃熱力圖、長條圖、跨賽季趨勢圖
 * Chart.js 透過 CDN 載入（全域 Chart 物件）
 * 需求：4.3, 9.3, 9.5, 10.3, 12.4, 16.6
 */
var Charts = (function () {
  'use strict';

  // --- 品牌色彩（從 CSS 變數讀取，含降級值）---
  function getCSSVar(name, fallback) {
    if (typeof getComputedStyle !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
      var val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (val) return val;
    }
    return fallback;
  }

  var COLORS = {
    primary: function () { return getCSSVar('--color-primary', '#1a1a2e'); },
    secondary: function () { return getCSSVar('--color-secondary', '#e94560'); },
    secondaryLight: function () { return getCSSVar('--color-secondary-light', '#ff6b81'); },
    accent: function () { return getCSSVar('--color-accent', '#f5a623'); },
    accentLight: function () { return getCSSVar('--color-accent-light', '#ffd166'); },
    info: function () { return getCSSVar('--color-info', '#3498db'); },
    success: function () { return getCSSVar('--color-success', '#2ecc71'); },
    textSecondary: function () { return getCSSVar('--color-text-secondary', '#a0a0b8'); },
    border: function () { return getCSSVar('--color-border', '#2a2a4a'); },
    surface: function () { return getCSSVar('--color-surface', '#1a1a2e'); }
  };

  // 預設圖表調色盤（用於多資料集）
  var PALETTE = [
    function () { return COLORS.secondary(); },
    function () { return COLORS.accent(); },
    function () { return COLORS.info(); },
    function () { return COLORS.success(); },
    function () { return COLORS.secondaryLight(); },
    function () { return COLORS.accentLight(); }
  ];

  // --- 共用預設選項 ---
  function baseOptions(extraOpts) {
    var opts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: COLORS.textSecondary(),
            font: { size: 12 }
          }
        }
      }
    };
    if (extraOpts) {
      // 淺層合併
      for (var key in extraOpts) {
        if (extraOpts.hasOwnProperty(key)) {
          opts[key] = extraOpts[key];
        }
      }
    }
    return opts;
  }

  function gridColor() {
    return 'rgba(42, 42, 74, 0.5)';
  }

  function tickColor() {
    return COLORS.textSecondary();
  }


  /**
   * 取得 canvas 元素（支援 ID 字串或 DOM 元素）
   * @param {string|HTMLCanvasElement} canvasId
   * @returns {HTMLCanvasElement|null}
   */
  function getCanvas(canvasId) {
    if (typeof canvasId === 'string') {
      return typeof document !== 'undefined' ? document.getElementById(canvasId) : null;
    }
    return canvasId || null;
  }

  /**
   * 銷毀已存在於同一 canvas 上的 Chart 實例（避免重複渲染）
   * @param {HTMLCanvasElement} canvas
   */
  function destroyExisting(canvas) {
    if (typeof Chart === 'undefined') return;
    // Chart.js 4.x: Chart.getChart(canvas)
    if (typeof Chart.getChart === 'function') {
      var existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
    }
  }

  // =============================================
  // createTrendChart — 折線圖（球員得分趨勢）
  // 需求 4.3：最近 N 場比賽的得分趨勢
  // =============================================
  /**
   * @param {string|HTMLCanvasElement} canvasId - canvas 元素 ID 或 DOM 元素
   * @param {string[]} labels - X 軸標籤（如日期）
   * @param {number[]} data - Y 軸數據（如得分）
   * @param {Object} [options] - 額外選項
   * @param {string} [options.label] - 資料集標籤
   * @param {string} [options.borderColor] - 線條顏色
   * @param {string} [options.backgroundColor] - 填充顏色
   * @param {boolean} [options.fill] - 是否填充
   * @returns {Chart|null}
   */
  function createTrendChart(canvasId, labels, data, options) {
    var canvas = getCanvas(canvasId);
    if (!canvas) return null;
    destroyExisting(canvas);

    var opts = options || {};
    var lineColor = opts.borderColor || COLORS.secondary();
    var fillColor = opts.backgroundColor || hexToRgba(lineColor, 0.1);

    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels || [],
        datasets: [{
          label: opts.label || 'PTS',
          data: data || [],
          borderColor: lineColor,
          backgroundColor: fillColor,
          borderWidth: 2,
          pointBackgroundColor: lineColor,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: opts.fill !== undefined ? opts.fill : true,
          tension: 0.3
        }]
      },
      options: baseOptions({
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: tickColor() },
            grid: { color: gridColor() }
          },
          y: {
            beginAtZero: true,
            ticks: { color: tickColor() },
            grid: { color: gridColor() }
          }
        }
      })
    });
  }


  // =============================================
  // createRadarChart — 雷達圖（球員對比）
  // 需求 10.3：兩位球員的多維度數據對比
  // =============================================
  /**
   * @param {string|HTMLCanvasElement} canvasId
   * @param {number[]} player1Data - 球員 1 各維度數值
   * @param {number[]} player2Data - 球員 2 各維度數值
   * @param {string[]} labels - 各維度標籤（如 PTS, REB, AST...）
   * @returns {Chart|null}
   */
  function createRadarChart(canvasId, player1Data, player2Data, labels) {
    var canvas = getCanvas(canvasId);
    if (!canvas) return null;
    destroyExisting(canvas);

    var color1 = COLORS.secondary();
    var color2 = COLORS.accent();

    return new Chart(canvas, {
      type: 'radar',
      data: {
        labels: labels || [],
        datasets: [
          {
            label: 'Player 1',
            data: player1Data || [],
            borderColor: color1,
            backgroundColor: hexToRgba(color1, 0.2),
            borderWidth: 2,
            pointBackgroundColor: color1,
            pointRadius: 4
          },
          {
            label: 'Player 2',
            data: player2Data || [],
            borderColor: color2,
            backgroundColor: hexToRgba(color2, 0.2),
            borderWidth: 2,
            pointBackgroundColor: color2,
            pointRadius: 4
          }
        ]
      },
      options: baseOptions({
        scales: {
          r: {
            beginAtZero: true,
            angleLines: { color: gridColor() },
            grid: { color: gridColor() },
            pointLabels: {
              color: COLORS.textSecondary(),
              font: { size: 12 }
            },
            ticks: {
              color: COLORS.textSecondary(),
              backdropColor: 'transparent',
              font: { size: 10 }
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: COLORS.textSecondary(),
              font: { size: 12 }
            }
          }
        }
      })
    });
  }


  // =============================================
  // createShotChart — 投籃熱力圖
  // 需求 9.3, 9.5：以半場籃球場為底圖，不同顏色區分命中率
  // =============================================
  /**
   * 在 canvas 上繪製投籃位置散點圖，以半場籃球場圖片為背景。
   * 使用 Chart.js scatter 圖表搭配 chartjs-plugin-annotation 或自訂繪製。
   * shots 座標為百分比（0-100），映射至 canvas 尺寸。
   *
   * @param {string|HTMLCanvasElement} canvasId
   * @param {Array<{x: number, y: number, made: boolean}>} shots - 投籃記錄
   * @param {string} courtImageUrl - 半場籃球場底圖 URL
   * @returns {void}
   */
  function createShotChart(canvasId, shots, courtImageUrl) {
    var canvas = getCanvas(canvasId);
    if (!canvas) return;
    destroyExisting(canvas);

    var shotData = shots || [];
    var madeShots = [];
    var missedShots = [];

    for (var i = 0; i < shotData.length; i++) {
      var s = shotData[i];
      var point = { x: s.x, y: s.y };
      if (s.made) {
        madeShots.push(point);
      } else {
        missedShots.push(point);
      }
    }

    var madeColor = COLORS.success();
    var missedColor = COLORS.secondary();

    // 背景圖片插件
    var courtPlugin = {
      id: 'courtBackground',
      beforeDraw: function (chart) {
        if (!chart._courtImage || !chart._courtImageLoaded) return;
        var ctx = chart.ctx;
        var chartArea = chart.chartArea;
        ctx.save();
        ctx.drawImage(
          chart._courtImage,
          chartArea.left,
          chartArea.top,
          chartArea.right - chartArea.left,
          chartArea.bottom - chartArea.top
        );
        ctx.restore();
      }
    };

    var chartInstance = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Made',
            data: madeShots,
            backgroundColor: hexToRgba(madeColor, 0.7),
            borderColor: madeColor,
            borderWidth: 1,
            pointRadius: 6,
            pointHoverRadius: 8
          },
          {
            label: 'Missed',
            data: missedShots,
            backgroundColor: hexToRgba(missedColor, 0.7),
            borderColor: missedColor,
            borderWidth: 1,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: 'crossRot'
          }
        ]
      },
      options: baseOptions({
        scales: {
          x: {
            min: 0,
            max: 100,
            ticks: { display: false },
            grid: { display: false },
            border: { display: false }
          },
          y: {
            min: 0,
            max: 100,
            reverse: true,
            ticks: { display: false },
            grid: { display: false },
            border: { display: false }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: COLORS.textSecondary(),
              font: { size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var ds = ctx.dataset.label || '';
                return ds + ' (' + ctx.parsed.x.toFixed(0) + ', ' + ctx.parsed.y.toFixed(0) + ')';
              }
            }
          }
        }
      }),
      plugins: [courtPlugin]
    });

    // 載入球場底圖
    if (courtImageUrl && typeof Image !== 'undefined') {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        chartInstance._courtImage = img;
        chartInstance._courtImageLoaded = true;
        chartInstance.draw();
      };
      img.onerror = function () {
        // 底圖載入失敗，圖表仍可正常顯示散點
        chartInstance._courtImageLoaded = false;
      };
      img.src = courtImageUrl;
    }
  }


  // =============================================
  // createBarChart — 長條圖（排行榜視覺化）
  // =============================================
  /**
   * @param {string|HTMLCanvasElement} canvasId
   * @param {string[]} labels - 各長條標籤（如球員名稱）
   * @param {number[]} data - 各長條數值
   * @returns {Chart|null}
   */
  function createBarChart(canvasId, labels, data) {
    var canvas = getCanvas(canvasId);
    if (!canvas) return null;
    destroyExisting(canvas);

    var barColor = COLORS.secondary();

    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels || [],
        datasets: [{
          label: '',
          data: data || [],
          backgroundColor: hexToRgba(barColor, 0.8),
          borderColor: barColor,
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 48
        }]
      },
      options: baseOptions({
        indexAxis: 'y',
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: tickColor() },
            grid: { color: gridColor() }
          },
          y: {
            ticks: { color: tickColor() },
            grid: { display: false }
          }
        }
      })
    });
  }

  // =============================================
  // createSeasonTrendChart — 跨賽季趨勢圖
  // 需求 16.6：歷屆得分王場均得分對比等
  // =============================================
  /**
   * @param {string|HTMLCanvasElement} canvasId
   * @param {string[]} seasons - 賽季名稱陣列（X 軸）
   * @param {Array<{label: string, data: number[]}>} datasets - 多條資料線
   * @returns {Chart|null}
   */
  function createSeasonTrendChart(canvasId, seasons, datasets) {
    var canvas = getCanvas(canvasId);
    if (!canvas) return null;
    destroyExisting(canvas);

    var chartDatasets = [];
    var dsArray = datasets || [];
    for (var i = 0; i < dsArray.length; i++) {
      var ds = dsArray[i];
      var colorFn = PALETTE[i % PALETTE.length];
      var color = colorFn();
      chartDatasets.push({
        label: ds.label || 'Series ' + (i + 1),
        data: ds.data || [],
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.1),
        borderWidth: 2,
        pointBackgroundColor: color,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: false,
        tension: 0.3
      });
    }

    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: seasons || [],
        datasets: chartDatasets
      },
      options: baseOptions({
        scales: {
          x: {
            ticks: { color: tickColor() },
            grid: { color: gridColor() }
          },
          y: {
            beginAtZero: true,
            ticks: { color: tickColor() },
            grid: { color: gridColor() }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: COLORS.textSecondary(),
              font: { size: 12 }
            }
          }
        }
      })
    });
  }


  // --- 工具函數 ---

  /**
   * 將 hex 色碼轉為 rgba 字串
   * @param {string} hex - 如 '#e94560' 或 'rgb(...)' 
   * @param {number} alpha - 透明度 0-1
   * @returns {string} rgba 字串
   */
  function hexToRgba(hex, alpha) {
    if (!hex) return 'rgba(0,0,0,' + alpha + ')';
    // 如果已經是 rgb/rgba 格式
    if (hex.indexOf('rgb') === 0) {
      if (hex.indexOf('rgba') === 0) return hex;
      return hex.replace('rgb', 'rgba').replace(')', ', ' + alpha + ')');
    }
    // 解析 hex
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return 'rgba(0,0,0,' + alpha + ')';
    var r = parseInt(result[1], 16);
    var g = parseInt(result[2], 16);
    var b = parseInt(result[3], 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  // --- 公開 API ---
  return {
    createTrendChart: createTrendChart,
    createRadarChart: createRadarChart,
    createShotChart: createShotChart,
    createBarChart: createBarChart,
    createSeasonTrendChart: createSeasonTrendChart,
    // 暴露工具函數供測試
    _hexToRgba: hexToRgba
  };
})();

// Node.js / 測試環境匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Charts;
}
