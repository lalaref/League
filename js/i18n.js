/**
 * ALL-IN Basketball League — 國際化模組 (i18n)
 * 支援繁體中文及英文雙語切換，語言偏好儲存於 localStorage
 * 需求：17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */
var I18n = (function () {
  'use strict';

  var STORAGE_KEY = 'allin_lang';
  var DEFAULT_LANG = 'zh-TW';
  var SUPPORTED_LANGS = ['zh-TW', 'en'];

  /** @type {string} 當前語言 */
  var currentLang = DEFAULT_LANG;

  /** @type {Object} 已載入的翻譯數據 { 'zh-TW': {...}, 'en': {...} } */
  var translations = {};

  /**
   * 初始化 i18n 模組：讀取語言偏好並載入語言檔
   * @returns {Promise<void>}
   */
  function init() {
    currentLang = getLangPreference();
    return loadLanguage(currentLang)
      .then(function () {
        _updateDOM();
        _bindLangSwitchButtons();
      })
      .catch(function () {
        // 載入失敗時降級使用繁體中文
        if (currentLang !== DEFAULT_LANG) {
          currentLang = DEFAULT_LANG;
          return loadLanguage(DEFAULT_LANG).then(_updateDOM).catch(function () {
            // 完全失敗，靜默處理
          });
        }
      });
  }

  /**
   * 載入指定語言的 JSON 檔案
   * @param {string} lang - 語言代碼 ('zh-TW' 或 'en')
   * @returns {Promise<void>}
   */
  function loadLanguage(lang) {
    if (translations[lang]) {
      return Promise.resolve();
    }

    var basePath = _getBasePath();
    var url = basePath + 'i18n/' + lang + '.json';

    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('無法載入語言檔：' + lang);
        return res.json();
      })
      .then(function (data) {
        translations[lang] = data;
      });
  }

  /**
   * 切換語言並即時更新所有 DOM 元素
   * @param {string} lang - 目標語言代碼
   * @returns {Promise<void>}
   */
  function switchLanguage(lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) {
      lang = DEFAULT_LANG;
    }
    return loadLanguage(lang).then(function () {
      currentLang = lang;
      saveLangPreference(lang);
      _updateDOM();
      // 更新 html lang 屬性
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang === 'zh-TW' ? 'zh-Hant' : 'en';
      }
    });
  }

  /**
   * 翻譯鍵值，支援參數插值
   * @param {string} key - 翻譯鍵值（支援點號分隔，如 "nav.home"）
   * @param {Object} [params] - 插值參數，如 { name: '陳大文' }
   * @returns {string} 翻譯後的文字，找不到時回傳鍵值本身
   */
  function t(key, params) {
    var dict = translations[currentLang];
    if (!dict) return key;

    var value = _getNestedValue(dict, key);
    if (value === undefined || value === null) return key;

    // 參數插值：將 {paramName} 替換為實際值
    if (params && typeof value === 'string') {
      Object.keys(params).forEach(function (paramKey) {
        value = value.replace(new RegExp('\\{' + paramKey + '\\}', 'g'), params[paramKey]);
      });
    }

    return value;
  }

  /**
   * 儲存語言偏好至 localStorage
   * @param {string} lang
   */
  function saveLangPreference(lang) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, lang);
      }
    } catch (e) {
      // localStorage 不可用時靜默處理
    }
  }

  /**
   * 從 localStorage 讀取語言偏好
   * @returns {string} 語言代碼
   */
  function getLangPreference() {
    try {
      if (typeof localStorage !== 'undefined') {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved && SUPPORTED_LANGS.indexOf(saved) !== -1) {
          return saved;
        }
      }
    } catch (e) {
      // localStorage 不可用
    }
    return DEFAULT_LANG;
  }

  /**
   * 取得當前語言代碼
   * @returns {string}
   */
  function getCurrentLang() {
    return currentLang;
  }

  // --- 內部輔助函數 ---

  /**
   * 從巢狀物件中取得值（支援點號路徑）
   * @param {Object} obj
   * @param {string} path - 如 "nav.home"
   * @returns {*}
   */
  function _getNestedValue(obj, path) {
    var keys = path.split('.');
    var current = obj;
    for (var i = 0; i < keys.length; i++) {
      if (current === undefined || current === null) return undefined;
      current = current[keys[i]];
    }
    return current;
  }

  /**
   * 更新所有帶 data-i18n 屬性的 DOM 元素
   */
  function _updateDOM() {
    if (typeof document === 'undefined') return;

    // 更新文字內容
    var elements = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var key = el.getAttribute('data-i18n');
      var translated = t(key);
      if (translated !== key) {
        el.textContent = translated;
      }
    }

    // 更新屬性（如 aria-label、placeholder 等）
    var attrElements = document.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrElements.length; j++) {
      var attrEl = attrElements[j];
      var attrSpec = attrEl.getAttribute('data-i18n-attr');
      // 格式：attr:key 或 attr1:key1,attr2:key2
      var pairs = attrSpec.split(',');
      for (var k = 0; k < pairs.length; k++) {
        var parts = pairs[k].split(':');
        if (parts.length === 2) {
          var attrName = parts[0].trim();
          var attrKey = parts[1].trim();
          var attrValue = t(attrKey);
          if (attrValue !== attrKey) {
            attrEl.setAttribute(attrName, attrValue);
          }
        }
      }
    }

    // 更新語言切換按鈕文字
    var langBtns = document.querySelectorAll('.lang-switch-btn');
    for (var l = 0; l < langBtns.length; l++) {
      var span = langBtns[l].querySelector('[data-i18n="nav.lang"]');
      if (span) {
        span.textContent = currentLang === 'zh-TW' ? 'EN' : '中';
      }
    }
  }

  /**
   * 綁定語言切換按鈕事件
   */
  function _bindLangSwitchButtons() {
    if (typeof document === 'undefined') return;
    var btns = document.querySelectorAll('.lang-switch-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var nextLang = currentLang === 'zh-TW' ? 'en' : 'zh-TW';
        switchLanguage(nextLang);
      });
    }
  }

  /**
   * 計算 i18n 語言檔的基礎路徑
   * @returns {string}
   */
  function _getBasePath() {
    if (typeof window === 'undefined') return '';
    var path = window.location.pathname;
    // 如果在 admin/ 子目錄下，需要回到上一層
    if (path.indexOf('/admin/') !== -1) {
      return '../';
    }
    return '';
  }

  /**
   * 直接設定翻譯數據（用於測試）
   * @param {string} lang
   * @param {Object} data
   */
  function _setTranslations(lang, data) {
    translations[lang] = data;
    currentLang = lang;
  }

  // 公開 API
  return {
    init: init,
    loadLanguage: loadLanguage,
    switchLanguage: switchLanguage,
    t: t,
    saveLangPreference: saveLangPreference,
    getLangPreference: getLangPreference,
    getCurrentLang: getCurrentLang,
    _setTranslations: _setTranslations
  };
})();

// Node.js / 測試環境匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = I18n;
}
