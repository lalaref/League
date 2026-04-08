/**
 * ALL-IN Basketball League — charts.js 單元測試
 * 測試 Chart.js 圖表封裝模組的各函數
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock Chart.js 全域物件 ---
const mockDestroy = vi.fn();
const mockDraw = vi.fn();
const chartInstances = new Map();

function MockChart(canvas, config) {
  this.canvas = canvas;
  this.config = config;
  this.type = config.type;
  this.data = config.data;
  this.options = config.options;
  this.ctx = { save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() };
  this.chartArea = { left: 0, top: 0, right: 400, bottom: 300 };
  this.destroy = mockDestroy;
  this.draw = mockDraw;
  this._courtImage = null;
  this._courtImageLoaded = false;
  // Run plugins if provided
  if (config.plugins) {
    this._plugins = config.plugins;
  }
  chartInstances.set(canvas, this);
}
MockChart.getChart = function (canvas) {
  return chartInstances.get(canvas) || null;
};

global.Chart = MockChart;

// --- Mock DOM ---
const canvasElements = {};
function createMockCanvas(id) {
  const canvas = { id: id, tagName: 'CANVAS' };
  canvasElements[id] = canvas;
  return canvas;
}

// Mock document.getElementById
global.document = {
  getElementById: function (id) { return canvasElements[id] || null; },
  documentElement: {}
};
global.getComputedStyle = function () {
  return { getPropertyValue: function () { return ''; } };
};

// Load module
const Charts = require('./charts.js');

describe('Charts module', function () {
  beforeEach(function () {
    chartInstances.clear();
    mockDestroy.mockClear();
    mockDraw.mockClear();
    // Reset canvas elements
    for (var key in canvasElements) {
      delete canvasElements[key];
    }
  });

  describe('_hexToRgba', function () {
    it('converts hex color to rgba', function () {
      var result = Charts._hexToRgba('#e94560', 0.5);
      expect(result).toBe('rgba(233, 69, 96, 0.5)');
    });

    it('handles hex without hash', function () {
      var result = Charts._hexToRgba('e94560', 0.3);
      expect(result).toBe('rgba(233, 69, 96, 0.3)');
    });

    it('returns fallback for null/empty input', function () {
      expect(Charts._hexToRgba(null, 0.5)).toBe('rgba(0,0,0,0.5)');
      expect(Charts._hexToRgba('', 0.5)).toBe('rgba(0,0,0,0.5)');
    });

    it('passes through rgba strings', function () {
      var rgba = 'rgba(100, 200, 50, 0.8)';
      expect(Charts._hexToRgba(rgba, 0.5)).toBe(rgba);
    });

    it('converts rgb to rgba', function () {
      var result = Charts._hexToRgba('rgb(100, 200, 50)', 0.5);
      expect(result).toBe('rgba(100, 200, 50, 0.5)');
    });
  });

  describe('createTrendChart', function () {
    it('returns null when canvas not found', function () {
      var result = Charts.createTrendChart('nonexistent', [], []);
      expect(result).toBeNull();
    });

    it('creates a line chart with correct config', function () {
      createMockCanvas('trend');
      var labels = ['G1', 'G2', 'G3'];
      var data = [20, 25, 18];
      var chart = Charts.createTrendChart('trend', labels, data);

      expect(chart).not.toBeNull();
      expect(chart.type).toBe('line');
      expect(chart.data.labels).toEqual(labels);
      expect(chart.data.datasets[0].data).toEqual(data);
      expect(chart.options.responsive).toBe(true);
      expect(chart.options.maintainAspectRatio).toBe(false);
    });

    it('accepts custom options', function () {
      createMockCanvas('trend2');
      var chart = Charts.createTrendChart('trend2', ['A'], [10], {
        label: 'REB',
        borderColor: '#3498db',
        fill: false
      });

      expect(chart.data.datasets[0].label).toBe('REB');
      expect(chart.data.datasets[0].borderColor).toBe('#3498db');
      expect(chart.data.datasets[0].fill).toBe(false);
    });

    it('destroys existing chart on same canvas', function () {
      createMockCanvas('trend3');
      Charts.createTrendChart('trend3', ['A'], [10]);
      Charts.createTrendChart('trend3', ['B'], [20]);
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('createRadarChart', function () {
    it('returns null when canvas not found', function () {
      var result = Charts.createRadarChart('nonexistent', [], [], []);
      expect(result).toBeNull();
    });

    it('creates a radar chart with two datasets', function () {
      createMockCanvas('radar');
      var p1 = [25, 8, 5, 2, 1];
      var p2 = [18, 12, 3, 1, 3];
      var labels = ['PTS', 'REB', 'AST', 'STL', 'BLK'];
      var chart = Charts.createRadarChart('radar', p1, p2, labels);

      expect(chart).not.toBeNull();
      expect(chart.type).toBe('radar');
      expect(chart.data.datasets).toHaveLength(2);
      expect(chart.data.datasets[0].data).toEqual(p1);
      expect(chart.data.datasets[1].data).toEqual(p2);
      expect(chart.data.labels).toEqual(labels);
      expect(chart.options.responsive).toBe(true);
      expect(chart.options.maintainAspectRatio).toBe(false);
    });
  });

  describe('createShotChart', function () {
    it('does nothing when canvas not found', function () {
      // Should not throw
      Charts.createShotChart('nonexistent', [], '');
    });

    it('creates a scatter chart separating made and missed shots', function () {
      createMockCanvas('shot');
      var shots = [
        { x: 50, y: 30, made: true },
        { x: 20, y: 60, made: false },
        { x: 70, y: 40, made: true }
      ];
      Charts.createShotChart('shot', shots, '');

      var chart = chartInstances.get(canvasElements['shot']);
      expect(chart).toBeDefined();
      expect(chart.type).toBe('scatter');
      // Made shots dataset
      expect(chart.data.datasets[0].data).toHaveLength(2);
      // Missed shots dataset
      expect(chart.data.datasets[1].data).toHaveLength(1);
      // Axes range 0-100
      expect(chart.options.scales.x.min).toBe(0);
      expect(chart.options.scales.x.max).toBe(100);
      expect(chart.options.scales.y.min).toBe(0);
      expect(chart.options.scales.y.max).toBe(100);
    });

    it('handles empty shots array', function () {
      createMockCanvas('shot2');
      Charts.createShotChart('shot2', [], '');
      var chart = chartInstances.get(canvasElements['shot2']);
      expect(chart.data.datasets[0].data).toHaveLength(0);
      expect(chart.data.datasets[1].data).toHaveLength(0);
    });
  });

  describe('createBarChart', function () {
    it('returns null when canvas not found', function () {
      var result = Charts.createBarChart('nonexistent', [], []);
      expect(result).toBeNull();
    });

    it('creates a horizontal bar chart', function () {
      createMockCanvas('bar');
      var labels = ['Player A', 'Player B', 'Player C'];
      var data = [25.3, 22.1, 20.5];
      var chart = Charts.createBarChart('bar', labels, data);

      expect(chart).not.toBeNull();
      expect(chart.type).toBe('bar');
      expect(chart.data.labels).toEqual(labels);
      expect(chart.data.datasets[0].data).toEqual(data);
      expect(chart.options.indexAxis).toBe('y');
      expect(chart.options.responsive).toBe(true);
      expect(chart.options.maintainAspectRatio).toBe(false);
    });
  });

  describe('createSeasonTrendChart', function () {
    it('returns null when canvas not found', function () {
      var result = Charts.createSeasonTrendChart('nonexistent', [], []);
      expect(result).toBeNull();
    });

    it('creates a multi-line chart for season trends', function () {
      createMockCanvas('season');
      var seasons = ['2023 Summer', '2023 Winter', '2024 Summer'];
      var datasets = [
        { label: 'Scoring Leader', data: [28.5, 26.3, 30.1] },
        { label: 'Rebound Leader', data: [12.1, 11.5, 13.2] }
      ];
      var chart = Charts.createSeasonTrendChart('season', seasons, datasets);

      expect(chart).not.toBeNull();
      expect(chart.type).toBe('line');
      expect(chart.data.labels).toEqual(seasons);
      expect(chart.data.datasets).toHaveLength(2);
      expect(chart.data.datasets[0].label).toBe('Scoring Leader');
      expect(chart.data.datasets[1].label).toBe('Rebound Leader');
      expect(chart.options.responsive).toBe(true);
      expect(chart.options.maintainAspectRatio).toBe(false);
    });

    it('handles empty datasets', function () {
      createMockCanvas('season2');
      var chart = Charts.createSeasonTrendChart('season2', [], []);
      expect(chart).not.toBeNull();
      expect(chart.data.datasets).toHaveLength(0);
    });
  });

  describe('responsive behavior', function () {
    it('all chart types set responsive: true and maintainAspectRatio: false', function () {
      createMockCanvas('r1');
      createMockCanvas('r2');
      createMockCanvas('r3');
      createMockCanvas('r4');

      var trend = Charts.createTrendChart('r1', ['A'], [1]);
      var radar = Charts.createRadarChart('r2', [1], [2], ['X']);
      var bar = Charts.createBarChart('r3', ['A'], [1]);
      var season = Charts.createSeasonTrendChart('r4', ['S1'], [{ label: 'L', data: [1] }]);

      [trend, radar, bar, season].forEach(function (chart) {
        expect(chart.options.responsive).toBe(true);
        expect(chart.options.maintainAspectRatio).toBe(false);
      });
    });
  });
});
