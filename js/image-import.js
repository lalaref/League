var ImageImport = (function () {
  'use strict';

  function read(file, options) {
    options = options || {};
    if (!file || !/^image\//.test(file.type || '')) {
      return Promise.reject(new Error('請選擇圖片檔案'));
    }

    return _readAsDataURL(file).then(function (dataUrl) {
      if (file.type === 'image/svg+xml') return dataUrl;
      return _resizeImage(dataUrl, file.type, options).catch(function () {
        return dataUrl;
      });
    });
  }

  function createController(options) {
    var input = typeof options.input === 'string' ? document.getElementById(options.input) : options.input;
    var preview = typeof options.preview === 'string' ? document.getElementById(options.preview) : options.preview;
    var value = '';
    var pending = Promise.resolve();

    function render() {
      if (!preview) return;
      if (value) {
        preview.src = value;
        preview.hidden = false;
      } else {
        preview.removeAttribute('src');
        preview.hidden = true;
      }
    }

    if (input) {
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        pending = read(file, options).then(function (dataUrl) {
          value = dataUrl;
          render();
          if (typeof options.onChange === 'function') options.onChange(dataUrl);
        }).catch(function (err) {
          input.value = '';
          if (typeof options.onError === 'function') options.onError(err);
        });
      });
    }

    return {
      getValue: function () { return value; },
      setValue: function (nextValue) {
        value = nextValue || '';
        if (input) input.value = '';
        render();
      },
      ready: function () { return pending; }
    };
  }

  function _readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('圖片讀取失敗')); };
      reader.readAsDataURL(file);
    });
  }

  function _resizeImage(dataUrl, fileType, options) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        var maxSize = options.maxSize || 900;
        var width = image.naturalWidth || image.width;
        var height = image.naturalHeight || image.height;
        var scale = Math.min(1, maxSize / Math.max(width, height));
        var targetWidth = Math.max(1, Math.round(width * scale));
        var targetHeight = Math.max(1, Math.round(height * scale));

        var canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

        var outputType = options.outputType || (fileType === 'image/png' ? 'image/png' : 'image/jpeg');
        var quality = options.quality || 0.82;
        resolve(canvas.toDataURL(outputType, quality));
      };
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  return {
    read: read,
    createController: createController
  };
})();