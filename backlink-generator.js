// backlink-generator.js — v7.2
// Client-side backlink / index-booster engine. No dependencies, no backend.
//
// v7.2: placeholder filling is explicit: a bare [URL] / {{URL}} is inserted
// as written, and [ENCODE_URL] is used in query values. The four templates that
// relied on guessing were rewritten to say so, so the position-sniffing regex
// is gone. Wayback submission no longer rides along in the YouTube template
// list; only the disclosed checkbox sends a URL to web.archive.org.
//
// v7.1: removed the archive-mirror expansion path (it duplicated all four
// delivery modes); archive templates now run like any other task.
//
// v7.0 changes:
// - Removed the commented-out spawnWaybackSaver block that threw a ReferenceError on every page load.
// - URL handling no longer decodes (corrupts) valid URLs and no longer rewrites www. targets.
// - Share links use ?u=<encoded>.
// - Public-suffix aware host parsing (DOMAINNAME / TLD / SECOND_LEVEL_DOMAIN).
// - Results are built with DOM APIs instead of innerHTML (template data is untrusted input).
// - Templates load from the script's own folder, so demo pages, custom domains and file:// work.
// - Wayback submission is opt-in and disclosed instead of firing on every run.
// - Loaded/failed counts, optional batch limit, no log wipe on rerun.

'use strict';

/* ------------------------------------------------------------------ *
 * Fallback data (used only when the JSON files cannot be fetched)
 * ------------------------------------------------------------------ */
let backlinkTemplates = [
  'https://www.facebook.com/sharer/sharer.php?u=[ENCODE_URL]',
  'https://twitter.com/intent/tweet?url=[ENCODE_URL]&text=[ENCODE_TITLE]'
];
let youtubeBacklinkTemplates = [
  'https://video.ultra-zone.net/watch.en.html.gz?v=[ID]'
];
let corsProxiesTemplates = [
  'https://api.allorigins.win/raw?url=[ENCODE_URL]'
];

const TASK_TIMEOUT = 8000;
const PING_TIMEOUT = 5000;
const RERUN_DELAY = 2000;
const WAYBACK_TEMPLATE = 'https://web.archive.org/save/[URL]';

// Two-label public suffixes we can handle offline. Longest match wins.
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'net.uk', 'sch.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au', 'asn.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'ac.in', 'gov.in',
  'co.za', 'org.za', 'net.za', 'gov.za', 'ac.za',
  'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il',
  'co.kr', 'or.kr', 'ne.kr', 'go.kr',
  'co.id', 'or.id', 'web.id', 'ac.id', 'go.id',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  'com.mx', 'org.mx', 'gob.mx', 'com.ar', 'com.tr', 'com.cn', 'net.cn', 'org.cn',
  'com.hk', 'com.sg', 'com.tw', 'com.my', 'com.ph', 'com.vn', 'com.pk', 'com.eg',
  'com.sa', 'com.ua', 'com.ng', 'com.pl', 'com.es', 'com.pt', 'com.ru',
  'co.ke', 'co.ug', 'co.tz', 'co.zw', 'co.th', 'co.ma',
  'edu.cn', 'edu.sg', 'ac.ir', 'co.ir'
]);

/* ------------------------------------------------------------------ *
 * Run state
 * ------------------------------------------------------------------ */
let runToken = 0;
let rerunTimer = null;
const activeIframes = new Set();
const activeWindows = new Set();

let running = false;
let queue = [];
let slots = [];
let totalTasks = 0;
let doneCount = 0;
let okCount = 0;
let failCount = 0;
let activeRunUrls = [];
let currentTarget = '';

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */
function el(id) {
  return document.getElementById(id);
}

// Base folder of this script file. Makes ./data.json work from /, /demo/ and file://.
const SCRIPT_BASE = (function () {
  try {
    const cs = document.currentScript;
    if (cs && cs.src) return new URL('.', cs.src).href;
  } catch (e) { /* ignore */ }
  try {
    return new URL('./', location.href).href;
  } catch (e) {
    return './';
  }
})();

function showNotice(message, kind) {
  let box = el('toolStatus');
  if (!box) {
    box = document.createElement('p');
    box.id = 'toolStatus';
    const anchor = el('controls');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
    else document.body.appendChild(box);
  }
  box.textContent = message;
  box.className = 'tool-status' + (kind ? ' ' + kind : '');
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  box.hidden = !message;
}

function clearNotice() {
  const box = el('toolStatus');
  if (box) {
    box.textContent = '';
    box.hidden = true;
  }
}

function isSafeHttpUrl(value) {
  try {
    const u = new URL(String(value), location.href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function shuffleInPlace(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function videoIdOf(url) {
  try {
    return new URL(url).searchParams.get('v');
  } catch (e) {
    return null;
  }
}

function templatesFor(vid) {
  return (vid ? youtubeBacklinkTemplates : backlinkTemplates).slice();
}

/* ------------------------------------------------------------------ *
 * Template loading
 * ------------------------------------------------------------------ */
async function loadTemplates() {
  const files = [
    ['backlink-templates.json', 'backlinks'],
    ['youtube-backlink-templates.json', 'youtube'],
    ['cors-proxies.json', 'proxies']
  ];
  const failed = [];

  await Promise.all(files.map(async ([file, kind]) => {
    try {
      const res = await fetch(new URL(file, SCRIPT_BASE), { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error('empty data');
      const clean = Array.from(new Set(
        data.filter(item => typeof item === 'string' && item.trim())
      ));
      if (!clean.length) throw new Error('no usable entries');
      if (kind === 'backlinks') backlinkTemplates = clean;
      else if (kind === 'youtube') youtubeBacklinkTemplates = clean;
      else corsProxiesTemplates = clean;
    } catch (e) {
      failed.push(file);
    }
  }));

  if (failed.length) {
    showNotice(
      'Some template lists could not be loaded (' + failed.join(', ') + '). ' +
      'Using built-in fallback templates for those lists.',
      'warn'
    );
  }
  return failed;
}

/* ------------------------------------------------------------------ *
 * URL normalisation
 * ------------------------------------------------------------------ */
function isHostnameLikelyValid(hostname) {
  if (!hostname) return false;
  hostname = hostname.toLowerCase();

  if (hostname === 'localhost') return true;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split('.').every(n => {
      const v = parseInt(n, 10);
      return v >= 0 && v <= 255;
    });
  }

  // IPv6 literal (URL() has already validated/normalised it)
  if (hostname.includes(':')) return true;

  if (hostname.indexOf('.') === -1) return false;

  const tld = hostname.split('.').pop();
  return /^[a-z]{2,63}$/i.test(tld);
}

/**
 * Normalise user input into a canonical http(s) URL.
 * A value that is already a parseable URL is never percent-decoded: decoding
 * turns %2F into a path separator and %26 into an extra query parameter.
 */
function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  let ustr = raw.trim();
  if (!ustr) return null;

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(ustr)) {
    // Not a URL yet: it may be a percent-encoded URL (https%3A%2F%2Fexample.com).
    try {
      const decoded = decodeURIComponent(ustr);
      if (decoded && decoded !== ustr) ustr = decoded;
    } catch (e) { /* malformed encoding: keep as typed */ }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(ustr)) ustr = 'https://' + ustr;
  }

  let p;
  try {
    p = new URL(ustr);
  } catch (e) {
    return null;
  }

  if (p.protocol !== 'http:' && p.protocol !== 'https:') return null;
  if (!isHostnameLikelyValid(p.hostname)) return null;
  if (p.username || p.password) return null;

  // Keep the hostname exactly as typed (www. is meaningful), keep path/query/hash.
  let out = p.toString();
  if (p.pathname === '/' && !p.search && !p.hash) out = out.replace(/\/$/, '');
  return out;
}

function isValidURL(value) {
  return !!normalizeUrl(value);
}

/**
 * Read the target out of the query string. Supports ?u=<encoded> (current)
 * and the legacy ?<raw url> form.
 */
function getUrlFromQuery(search) {
  if (!search || search === '?') return '';
  let params;
  try {
    params = new URLSearchParams(search);
  } catch (e) {
    return '';
  }
  const direct = params.get('u') || params.get('url');
  if (direct) {
    const norm = normalizeUrl(direct);
    if (norm) return norm;
  }
  const legacy = search.replace(/^\?/, '').split('&')[0];
  if (legacy && legacy !== direct) {
    const norm = normalizeUrl(legacy);
    if (norm) return norm;
  }
  return '';
}

function buildShareUrl(norm) {
  const base = (location.protocol === 'http:' || location.protocol === 'https:')
    ? location.origin + location.pathname
    : location.href.split('?')[0].split('#')[0];
  return base + '?u=' + encodeURIComponent(norm);
}

/* ------------------------------------------------------------------ *
 * Placeholder map
 * ------------------------------------------------------------------ */
function domainParts(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return { subdomain: '', domainname: '', tld: '', second: '' };

  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[');
  if (isIp || host.indexOf('.') === -1) {
    return { subdomain: '', domainname: host, tld: '', second: host };
  }

  const parts = host.split('.');
  let suffixLen = 1;
  if (parts.length >= 3 && MULTI_PART_SUFFIXES.has(parts.slice(-2).join('.'))) suffixLen = 2;

  const tld = parts.slice(-suffixLen).join('.');
  const sldIndex = parts.length - suffixLen - 1;
  const domainname = sldIndex >= 0 ? parts[sldIndex] : '';
  const subdomain = sldIndex > 0 ? parts.slice(0, sldIndex).join('.') + '.' : '';

  return {
    subdomain: subdomain,
    domainname: domainname,
    tld: tld,
    second: domainname ? domainname + '.' + tld : host
  };
}

function buildMap(url, vid) {
  const p = new URL(url);
  const d = domainParts(p.hostname);
  const hostnameNoWWW = p.hostname.replace(/^www\./i, '');

  const map = {
    PROTOCOL: p.protocol,
    SUBDOMAIN: d.subdomain,
    DOMAINNAME: d.domainname,
    TLD: d.tld,
    SECOND_LEVEL_DOMAIN: d.second,
    HOST: p.hostname,
    PORT: p.port ? ':' + p.port : '',
    PATH: p.pathname,
    QUERY: p.search,
    PARAMS: p.search ? p.search.slice(1) : '',
    FRAGMENT: p.hash,
    URL: url,
    DOMAIN: p.hostname,
    NOPROTOCOL_URL: p.hostname + p.pathname + p.search + p.hash,
    NOSUBDOMAIN_URL: hostnameNoWWW + p.pathname + p.search + p.hash
  };
  if (vid) map.ID = vid;

  Object.keys(map).forEach(key => {
    let encoded = '';
    try {
      encoded = encodeURIComponent(map[key]);
    } catch (e) {
      encoded = '';
    }
    map['ENCODE_' + key] = encoded;
  });

  return map;
}

// A placeholder is inserted as written: [URL] is raw, [ENCODE_URL] is encoded.
// Templates declare which they want, so nothing here has to guess.
function replacePlaceholders(tpl, map) {
  return tpl.replace(
    /(\{\{|\[)\s*(ENCODE_)?([A-Z0-9_]+)\s*(\}\}|\])/gi,
    function (match, open, encPrefix, key) {
      if (!key) return '';
      key = key.toUpperCase();
      if (encPrefix) {
        const encodedKey = 'ENCODE_' + key;
        if (Object.prototype.hasOwnProperty.call(map, encodedKey)) return map[encodedKey];
        try {
          return encodeURIComponent(map[key] || '');
        } catch (e) {
          return '';
        }
      }
      return map[key] || '';
    }
  );
}

function generateUrl(tpl, normUrl, vid) {
  if (!tpl) return '';
  tpl = tpl
    .replace(/%5B\s*(ENCODE_)?([A-Z0-9_]+)\s*%5D/gi, '[$1$2]')
    .replace(/&#(?:x5b|91);\s*(ENCODE_)?([A-Z0-9_]+)\s*&#(?:x5d|93);/gi, '[$1$2]')
    .replace(/\{\{\s*(ENCODE_)?([A-Z0-9_]+)\s*\}\}/gi, '[$1$2]')
    .replace(/%7B%7B\s*(ENCODE_)?([A-Z0-9_]+)\s*%7D%7D/gi, '[$1$2]');
  return replacePlaceholders(tpl, buildMap(normUrl, vid));
}

/* ------------------------------------------------------------------ *
 * Settings (cookie)
 * ------------------------------------------------------------------ */
function saveSettings() {
  const s = {
    mode: el('modeSelect') ? el('modeSelect').value : 'iframe',
    reuse: el('reuseToggle') ? el('reuseToggle').value : 'fresh',
    conc: el('concurrencyRange') ? el('concurrencyRange').value : 5,
    rerun: el('rerunCheckbox') ? el('rerunCheckbox').checked : false,
    shuffle: el('shuffleCheckbox') ? el('shuffleCheckbox').checked : true,
    wayback: el('waybackCheckbox') ? el('waybackCheckbox').checked : false,
    limit: el('batchLimit') ? el('batchLimit').value : '0'
  };
  let cookie = 'bg=' + encodeURIComponent(JSON.stringify(s)) + ';path=/;max-age=31536000;SameSite=Lax';
  if (location.protocol === 'https:') cookie += ';Secure';
  document.cookie = cookie;
}

function loadSettings() {
  const modeSelect = el('modeSelect');
  const reuseToggle = el('reuseToggle');
  const concurrencyRange = el('concurrencyRange');
  const rerunCheckbox = el('rerunCheckbox');
  const shuffleCheckbox = el('shuffleCheckbox');
  const waybackCheckbox = el('waybackCheckbox');
  const batchLimit = el('batchLimit');
  const concurrentCount = el('concurrentCount');

  const raw = document.cookie.split(';').map(x => x.trim()).find(x => x.startsWith('bg='));
  let saved = null;
  if (raw) {
    try {
      saved = JSON.parse(decodeURIComponent(raw.slice(3)));
    } catch (e) {
      saved = null;
    }
  }

  if (modeSelect) modeSelect.value = (saved && saved.mode) || 'iframe';
  if (reuseToggle) reuseToggle.value = (saved && saved.reuse) || 'fresh';
  if (concurrencyRange) concurrencyRange.value = String((saved && saved.conc) || 5);
  if (rerunCheckbox) rerunCheckbox.checked = saved ? saved.rerun === true : false;
  if (shuffleCheckbox) shuffleCheckbox.checked = saved ? saved.shuffle !== false : true;
  if (waybackCheckbox) waybackCheckbox.checked = saved ? saved.wayback === true : false;
  if (batchLimit) batchLimit.value = (saved && saved.limit) || '0';
  if (concurrentCount && concurrencyRange) concurrentCount.textContent = concurrencyRange.value;

  if (!saved) saveSettings();
}

/* ------------------------------------------------------------------ *
 * UI wiring
 * ------------------------------------------------------------------ */
function updateReuseToggleState() {
  const modeSelect = el('modeSelect');
  const reuseToggle = el('reuseToggle');
  if (!modeSelect || !reuseToggle) return;
  reuseToggle.disabled = !(modeSelect.value === 'popup' || modeSelect.value === 'tab');
}

function setExternalLink(text, href) {
  const link = el('externalLink');
  if (!link) return;
  if (!href) {
    link.style.display = 'none';
    return;
  }
  link.href = href;
  link.style.display = 'inline-block';
  let host = href;
  try {
    host = new URL(href).hostname;
  } catch (e) { /* keep as-is */ }
  link.textContent = '\uD83D\uDD17 ' + text + ' \u2192 ' + host;
}

/* ------------------------------------------------------------------ *
 * Results list
 * ------------------------------------------------------------------ */
function appendResult(url) {
  const resultsUl = el('results');
  if (!resultsUl) return null;

  const li = document.createElement('li');
  const a = document.createElement('a');
  a.textContent = url;
  a.title = url;
  if (isSafeHttpUrl(url)) {
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
  }
  const status = document.createElement('span');
  status.className = 'status loading';
  status.textContent = '\u23F3';
  status.setAttribute('role', 'img');
  status.setAttribute('aria-label', 'pending');

  li.appendChild(a);
  li.appendChild(status);
  resultsUl.appendChild(li);
  return status;
}

function markStatus(status, ok) {
  if (!status) return;
  status.textContent = ok ? '\u2714\uFE0F' : '\u2716\uFE0F';
  status.className = 'status ' + (ok ? 'success' : 'failure');
  status.setAttribute('aria-label', ok ? 'loaded' : 'did not load');
  status.title = ok
    ? 'The target page loaded (a load is not proof that a link was created).'
    : 'The target did not load (timeout, block or popup blocked).';
}

function updateProgress() {
  const bar = el('progressBar');
  const text = el('progressText');
  const pct = totalTasks ? Math.round((doneCount / totalTasks) * 100) : 0;
  if (bar) bar.style.width = pct + '%';
  if (text) {
    text.textContent = doneCount + '/' + totalTasks + ' (' + pct + '%) \u00B7 \u2714 ' + okCount + ' \u00B7 \u2716 ' + failCount;
  }
}

/* ------------------------------------------------------------------ *
 * Networking helpers
 * ------------------------------------------------------------------ */
async function fetchWithTimeout(resource, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout || PING_TIMEOUT);
  try {
    return await fetch(resource, { signal: controller.signal });
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isActive(slot) {
  return running && slot && slot.token === runToken;
}

function closeWindow(w) {
  try {
    w.close();
  } catch (e) { /* ignore */ }
  activeWindows.delete(w);
}

function destroyIframe(ifr) {
  try {
    ifr.remove();
  } catch (e) { /* ignore */ }
  activeIframes.delete(ifr);
}

/* ------------------------------------------------------------------ *
 * Delivery modes
 * ------------------------------------------------------------------ */
function runTask(slot, task) {
  return new Promise(resolve => {
    const statusSpan = appendResult(task.url);
    let settled = false;

    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(slot.timeoutId);
      slot.timeoutId = null;
      if (isActive(slot)) {
        markStatus(statusSpan, ok);
        if (ok) okCount += 1;
        else failCount += 1;
        doneCount += 1;
        updateProgress();
      }
      resolve();
    };

    if (task.mode === 'iframe') {
      const ifr = document.createElement('iframe');
      ifr.className = 'hidden-iframe';
      ifr.setAttribute('tabindex', '-1');
      ifr.setAttribute('aria-hidden', 'true');
      ifr.setAttribute('title', 'Backlink target');
      document.body.appendChild(ifr);
      activeIframes.add(ifr);

      ifr.onload = () => {
        destroyIframe(ifr);
        finish(true);
      };
      ifr.onerror = () => {
        destroyIframe(ifr);
        finish(false);
      };
      slot.timeoutId = setTimeout(() => {
        destroyIframe(ifr);
        finish(false);
      }, TASK_TIMEOUT);

      try {
        ifr.src = task.url;
      } catch (e) {
        destroyIframe(ifr);
        finish(false);
      }
      return;
    }

    if (task.mode === 'popup' || task.mode === 'tab') {
      const specs = task.mode === 'popup' ? 'width=600,height=400' : '';
      const reuse = el('reuseToggle') && el('reuseToggle').value === 'reuse';
      let w;

      if (reuse) {
        if (!slot.ref || slot.ref.closed) {
          slot.ref = window.open('about:blank', 'slot-' + slot.id, specs);
        }
        w = slot.ref;
      } else {
        w = window.open('about:blank', '_blank', specs);
      }

      if (!w) {
        showNotice('Pop-ups are blocked. Allow pop-ups for this site, or switch to IFrame / Ping mode.', 'warn');
        finish(false);
        return;
      }

      activeWindows.add(w);
      let loaded = false;
      try {
        w.onload = () => { loaded = true; };
      } catch (e) { /* ignore */ }
      try {
        w.location.href = task.url;
      } catch (e) { /* ignore */ }

      slot.timeoutId = setTimeout(() => {
        if (!reuse) closeWindow(w);
        finish(loaded);
      }, TASK_TIMEOUT);
      return;
    }

    if (task.mode === 'ping') {
      (async () => {
        for (const proxyTpl of corsProxiesTemplates) {
          if (!isActive(slot)) return finish(false);
          try {
            const proxyUrl = generateUrl(proxyTpl, task.url);
            if (!proxyUrl) continue;
            const res = await fetchWithTimeout(proxyUrl, PING_TIMEOUT);
            if (res && res.ok) return finish(true);
          } catch (e) { /* try next proxy */ }
        }
        finish(false);
      })();
      return;
    }

    finish(false);
  });
}

async function launchSlot(slot) {
  if (!isActive(slot)) return;
  const task = queue.shift();
  if (!task) {
    if (slots.every(s => !s.busy)) finishRun();
    return;
  }

  slot.busy = true;
  try {
    await runTask(slot, task);
  } catch (e) {
    /* a single template must never kill the run */
  } finally {
    slot.busy = false;
    if (isActive(slot)) launchSlot(slot);
    else if (running && slots.every(s => !s.busy)) finishRun();
  }
}

/* ------------------------------------------------------------------ *
 * Optional, disclosed Wayback submission
 * ------------------------------------------------------------------ */
function archiveTargetUrl(targetUrl) {
  if (!isSafeHttpUrl(targetUrl)) return false;
  try {
    const ifr = document.createElement('iframe');
    ifr.className = 'hidden-iframe';
    ifr.setAttribute('title', 'Wayback Machine submission');
    ifr.setAttribute('aria-hidden', 'true');
    ifr.setAttribute('tabindex', '-1');
    ifr.referrerPolicy = 'no-referrer';
    ifr.src = 'https://web.archive.org/save/' + targetUrl;
    document.body.appendChild(ifr);
    activeIframes.add(ifr);
    setTimeout(() => destroyIframe(ifr), 180000);
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Runs
 * ------------------------------------------------------------------ */
function buildQueue(norm, vid, mode) {
  const templates = templatesFor(vid);
  const shuffleCheckbox = el('shuffleCheckbox');
  if (shuffleCheckbox && shuffleCheckbox.checked) shuffleInPlace(templates);

  const limitEl = el('batchLimit');
  const limit = limitEl ? parseInt(limitEl.value, 10) || 0 : 0;
  const selected = limit > 0 ? templates.slice(0, limit) : templates;

  const tasks = [];
  const urls = [];
  for (const tpl of selected) {
    const finalUrl = generateUrl(tpl, norm, vid);
    if (!finalUrl || !isSafeHttpUrl(finalUrl)) continue;
    tasks.push({ mode: mode, url: finalUrl });
    urls.push(finalUrl);
  }

  return { tasks: tasks, urls: urls, skipped: templates.length - selected.length };
}

function startRun(isRerun) {
  const urlInput = el('urlInput');
  const typed = urlInput ? urlInput.value.trim() : '';
  const raw = typed || getUrlFromQuery(location.search);

  if (!raw) {
    showNotice('Enter a page URL to generate backlinks.', 'error');
    if (urlInput) urlInput.focus();
    return;
  }

  const norm = normalizeUrl(raw);
  if (!norm) {
    showNotice('That does not look like a valid http(s) URL. Try https://example.com/page', 'error');
    if (urlInput) {
      urlInput.setAttribute('aria-invalid', 'true');
      urlInput.focus();
    }
    return;
  }

  if (urlInput) {
    urlInput.value = norm;
    urlInput.removeAttribute('aria-invalid');
  }
  clearNotice();
  setExternalLink('Open target', norm);
  currentTarget = norm;
  saveSettings();

  runToken += 1;
  const thisToken = runToken;
  running = true;

  slots.forEach(s => {
    if (s.ref) closeWindow(s.ref);
  });
  queue = [];
  totalTasks = 0;
  doneCount = 0;
  okCount = 0;
  failCount = 0;

  if (rerunTimer) {
    clearTimeout(rerunTimer);
    rerunTimer = null;
  }

  const resultsUl = el('results');
  if (resultsUl && !isRerun) resultsUl.textContent = '';
  if (resultsUl && isRerun) {
    const divider = document.createElement('li');
    divider.className = 'run-divider';
    divider.textContent = 'New pass \u00B7 ' + new Date().toLocaleTimeString();
    resultsUl.appendChild(divider);
  }

  const vid = videoIdOf(norm);
  const mode = el('modeSelect') ? el('modeSelect').value : 'iframe';
  const built = buildQueue(norm, vid, mode);
  queue = built.tasks;
  activeRunUrls = built.urls;
  totalTasks = queue.length;

  const limitEl = el('batchLimit');
  const limit = limitEl ? parseInt(limitEl.value, 10) || 0 : 0;
  if (limit > 0 && built.skipped > 0) {
    showNotice('Batch limit active: running the first ' + totalTasks + ' of ' + (totalTasks + built.skipped) + ' generated URLs.', 'warn');
  } else if (!totalTasks) {
    showNotice('No usable templates were generated for this URL.', 'error');
    running = false;
    return;
  }

  updateProgress();

  const newUrlInput = el('newUrl');
  const shareUrl = buildShareUrl(norm);
  if (newUrlInput) newUrlInput.value = shareUrl;
  try {
    window.history.replaceState(null, '', location.pathname + '?u=' + encodeURIComponent(norm));
  } catch (e) { /* file:// or blocked history */ }

  const wayback = el('waybackCheckbox');
  if (wayback && wayback.checked) archiveTargetUrl(norm);

  const concurrencyRange = el('concurrencyRange');
  const concurrency = Math.max(1, Math.min(50, parseInt(concurrencyRange ? concurrencyRange.value : 5, 10) || 5));

  slots = Array.from({ length: concurrency }, (_, i) => ({
    id: i,
    busy: false,
    ref: null,
    timeoutId: null,
    token: thisToken
  }));

  const startBtn = el('startBtn');
  if (startBtn) startBtn.textContent = 'Stop';
  slots.forEach(s => launchSlot(s));
}

function finishRun() {
  if (!running) return;
  running = false;
  const startBtn = el('startBtn');
  if (startBtn) startBtn.textContent = 'Generate Backlinks';
  slots.forEach(s => {
    if (s.ref) closeWindow(s.ref);
    if (s.timeoutId) clearTimeout(s.timeoutId);
    s.timeoutId = null;
  });

  const rerunCheckbox = el('rerunCheckbox');
  if (rerunCheckbox && rerunCheckbox.checked) {
    rerunTimer = setTimeout(() => startRun(true), RERUN_DELAY);
  }
}

function stopRun() {
  running = false;
  runToken += 1; // invalidate stale callbacks
  queue = [];
  const startBtn = el('startBtn');
  if (startBtn) startBtn.textContent = 'Generate Backlinks';
  if (rerunTimer) {
    clearTimeout(rerunTimer);
    rerunTimer = null;
  }
  slots.forEach(s => {
    if (s.timeoutId) {
      clearTimeout(s.timeoutId);
      s.timeoutId = null;
    }
    s.busy = false;
    if (s.ref) closeWindow(s.ref);
  });
  activeWindows.forEach(w => closeWindow(w));
  activeWindows.clear();
  activeIframes.forEach(ifr => destroyIframe(ifr));
  activeIframes.clear();
  updateProgress();
}

/* ------------------------------------------------------------------ *
 * Download / copy
 * ------------------------------------------------------------------ */
function downloadUrls() {
  const urlInput = el('urlInput');
  const raw = (urlInput && urlInput.value.trim()) || currentTarget;
  const norm = normalizeUrl(raw);
  if (!norm) {
    showNotice('Enter a valid URL before downloading.', 'error');
    return;
  }

  // Reuse exactly what the last run produced, so the file matches the screen.
  let urls = activeRunUrls;
  if (!urls.length || norm !== currentTarget) {
    const vid = videoIdOf(norm);
    urls = templatesFor(vid)
      .map(tpl => generateUrl(tpl, norm, vid))
      .filter(Boolean);
  }

  const blob = new Blob([urls.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'backlinks-' + (new URL(norm).hostname || 'list') + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyShareUrl() {
  const newUrlInput = el('newUrl');
  const copyBtn = el('copyBtn');
  if (!newUrlInput || !newUrlInput.value) return;
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(newUrlInput.value);
      copied = true;
    }
  } catch (e) {
    copied = false;
  }
  if (!copied) {
    try {
      newUrlInput.select();
      copied = document.execCommand('copy');
    } catch (e) {
      copied = false;
    }
  }
  if (copyBtn) {
    const original = copyBtn.dataset.label || copyBtn.textContent;
    copyBtn.dataset.label = original;
    copyBtn.textContent = copied ? 'Copied \u2713' : 'Press Ctrl+C';
    setTimeout(() => {
      copyBtn.textContent = original;
    }, 1500);
  }
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
async function boot() {
  const modeSelect = el('modeSelect');
  const concurrencyRange = el('concurrencyRange');
  const concurrentCount = el('concurrentCount');
  const urlInput = el('urlInput');
  const startBtn = el('startBtn');
  const toggleAdvancedBtn = el('toggleAdvancedBtn');
  const advancedPanel = el('advancedPanel');
  const copyBtn = el('copyBtn');
  const downloadBtn = el('downloadBtn');
  const reuseToggle = el('reuseToggle');
  const rerunCheckbox = el('rerunCheckbox');
  const shuffleCheckbox = el('shuffleCheckbox');
  const waybackCheckbox = el('waybackCheckbox');
  const batchLimit = el('batchLimit');
  const progressBar = el('progressBar');
  const progressText = el('progressText');
  const externalLink = el('externalLink');

  loadSettings();
  updateReuseToggleState();

  if (concurrentCount && concurrencyRange) concurrentCount.textContent = concurrencyRange.value;

  if (modeSelect) {
    modeSelect.addEventListener('change', function () {
      updateReuseToggleState();
      saveSettings();
    });
  }

  [modeSelect, reuseToggle, rerunCheckbox, shuffleCheckbox, waybackCheckbox, batchLimit].forEach(node => {
    if (node) node.addEventListener('change', saveSettings);
  });

  if (concurrencyRange) {
    concurrencyRange.addEventListener('input', function () {
      if (concurrentCount) concurrentCount.textContent = concurrencyRange.value;
      saveSettings();
    });
  }

  if (toggleAdvancedBtn && advancedPanel) {
    toggleAdvancedBtn.setAttribute('aria-expanded', 'false');
    toggleAdvancedBtn.addEventListener('click', function () {
      const open = advancedPanel.style.display === 'none';
      advancedPanel.style.display = open ? 'block' : 'none';
      toggleAdvancedBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggleAdvancedBtn.textContent = open ? '\u2699\uFE0F Advanced \u25B2' : '\u2699\uFE0F Advanced \u25BC';
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', function () {
      if (running) stopRun();
      else startRun(false);
    });
  }

  if (urlInput) {
    urlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!running) startRun(false);
      }
    });
    urlInput.addEventListener('input', function () {
      urlInput.removeAttribute('aria-invalid');
    });
  }

  if (copyBtn) copyBtn.addEventListener('click', copyShareUrl);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadUrls);
  if (externalLink) externalLink.style.display = 'none';

  if (progressBar) progressBar.style.width = '0%';
  if (progressText) progressText.textContent = '0/0 (0%)';

  await loadTemplates();

  const fromQuery = getUrlFromQuery(location.search);
  if (fromQuery) {
    if (urlInput) urlInput.value = fromQuery;
    startRun(false);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// Expose a tiny, documented API for manual/console use.
window.BacklinkGenerator = {
  normalizeUrl: normalizeUrl,
  isValidURL: isValidURL,
  generateUrl: generateUrl,
  buildMap: buildMap,
  loadTemplates: loadTemplates,
  start: function () { startRun(false); },
  stop: stopRun,
  archiveTargetUrl: archiveTargetUrl
};
