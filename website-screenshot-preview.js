// website-screenshot-preview.js - v2.0
// Live thumbnail of the URL currently in the input box.
// Privacy/safety notes:
//  - The URL is sent to image.thum.io only after a short pause in typing (not on every keystroke),
//    and encoded with ?url= so query strings cannot break the request or leak extra path segments.
//  - Nothing is sent for invalid/non-http(s) values.
'use strict';

(function () {
  var THUM_IO_BASE = 'https://image.thum.io/get/width/800/crop/400/';
  var DEBOUNCE_MS = 800;
  var preview = null;
  var debounceTimer = null;
  var lastRequested = '';

  function normalizeInput(value) {
    if (!value || typeof value !== 'string') return null;
    var raw = value.trim();
    if (!raw) return null;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) raw = 'https://' + raw;
    try {
      var url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      var host = url.hostname;
      if (!host || (host.indexOf('.') === -1 && host !== 'localhost')) return null;
      return url;
    } catch (e) {
      return null;
    }
  }

  function hidePreview() {
    if (!preview) return;
    preview.removeAttribute('src');
    preview.style.display = 'none';
    preview.alt = 'Website preview';
  }

  function updateWebsiteScreenshot(value) {
    preview = preview || document.getElementById('previewwebsite');
    if (!preview) return;

    var url = normalizeInput(value);
    if (!url) {
      lastRequested = '';
      hidePreview();
      return;
    }

    var target = url.toString();
    if (target === lastRequested) return;
    lastRequested = target;

    preview.alt = 'Screenshot preview of ' + url.hostname;
    preview.style.display = 'block';
    preview.src = THUM_IO_BASE + '?url=' + encodeURIComponent(target);
  }

  function scheduleUpdate(value) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      updateWebsiteScreenshot(value);
    }, DEBOUNCE_MS);
  }

  function boot() {
    preview = document.getElementById('previewwebsite');
    var input = document.getElementById('urlInput');
    if (!input) return;

    var params = new URLSearchParams(window.location.search);
    var initial = params.get('u') || params.get('url') || '';
    var found = normalizeInput(initial);
    if (found) {
      input.value = found.toString();
      updateWebsiteScreenshot(found.toString());
    } else {
      hidePreview();
    }

    input.addEventListener('input', function (e) {
      scheduleUpdate(e.target.value);
    });

    input.addEventListener('blur', function (e) {
      clearTimeout(debounceTimer);
      updateWebsiteScreenshot(e.target.value);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
