// tools/check-ui.js
// Headless wiring test: boots the engine against a minimal fake DOM, auto-starts a
// run from ?u=<url>, and asserts the result rows, statuses and progress counters.
// Catches the class of failure that used to happen on every page load.
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('backlink-generator.js', 'utf8');

function makeElement(id) {
  const el = {
    id, style: {}, dataset: {}, value: '', checked: false, textContent: '', hidden: false,
    children: [], className: '', disabled: false, title: '', src: '', href: '',
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      contains(c) { return this._set.has(c); },
      remove(c) { this._set.delete(c); }
    },
    addEventListener(type, fn) { (this._handlers = this._handlers || {})[type] = fn; },
    setAttribute(k, v) { this['attr_' + k] = v; },
    removeAttribute(k) { delete this['attr_' + k]; },
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    focus() {},
    select() {},
    click() {},
    querySelector(sel) {
      if (sel === '.status') return this.status || null;
      return null;
    }
  };
  return el;
}

const ids = ['urlInput', 'startBtn', 'toggleAdvancedBtn', 'advancedPanel', 'modeSelect', 'reuseToggle',
  'concurrencyRange', 'concurrentCount', 'rerunCheckbox', 'shuffleCheckbox', 'newUrl', 'copyBtn',
  'downloadBtn', 'progressBar', 'progressText', 'results', 'externalLink', 'toolStatus',
  'waybackCheckbox', 'batchLimit', 'previewwebsite'];

const store = {};
for (const id of ids) store[id] = makeElement(id);
store.modeSelect.value = 'iframe';
store.reuseToggle.value = 'fresh';
store.concurrencyRange.value = '1';
store.batchLimit.value = '2';
store.shuffleCheckbox.checked = false;

const listeners = {};
const sandbox = {
  console, URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
  AbortController,
  setTimeout: (fn) => { fn(); return 1; },
  clearTimeout: () => {},
  fetch: async () => ({ ok: true, status: 200, json: async () => ['https://t.example/?url=[URL]', 'https://t2.example/[ENCODE_URL]', 'https://t3.example/?u=[URL]'] })
};
sandbox.document = {
  currentScript: { src: 'https://backlink.is-an.ai/backlink-generator.js' },
  cookie: 'bg=' + encodeURIComponent(JSON.stringify({ mode: 'iframe', reuse: 'fresh', conc: '1', rerun: false, shuffle: false, limit: '2' })),
  readyState: 'complete',
  getElementById: id => store[id] || null,
  addEventListener: (type, fn) => { listeners[type] = fn; },
  createElement: tag => makeElement(tag),
  body: { appendChild() {}, contains() { return true; } }
};
sandbox.location = {
  href: 'https://backlink.is-an.ai/index.html?u=https%3A%2F%2Fexample.com%2Fpage%3Fa%3D1',
  protocol: 'https:', origin: 'https://backlink.is-an.ai',
  pathname: '/index.html',
  search: '?u=https%3A%2F%2Fexample.com%2Fpage%3Fa%3D1'
};
sandbox.navigator = {};
sandbox.history = { replaceState() {} };
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'backlink-generator.js' });

setTimeout(() => {
  const results = store.results.children;
  const progress = store.progressText.textContent;
  let failures = 0;
  const check = (name, cond, detail) => {
    if (!cond) { failures++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
    else console.log('PASS ' + name);
  };

  check('run produced result rows', results.length === 2, 'rows=' + results.length + ' progress=' + progress);
  check('share url encoded', store.newUrl.value === 'https://backlink.is-an.ai/index.html?u=' + encodeURIComponent('https://example.com/page?a=1'), store.newUrl.value);
  check('target normalised in input', store.urlInput.value === 'https://example.com/page?a=1', store.urlInput.value);
  check('progress reached total', progress.startsWith('2/2'), progress);
  check('start button reset', store.startBtn.textContent === 'Generate Backlinks', store.startBtn.textContent);
  check('external link set', store.externalLink.href === 'https://example.com/page?a=1', store.externalLink.href);
  check('result rows keep link + status', results.every(li => li.children.length === 2), 'malformed row');
  check('batch limit notice shown', /Batch limit active/.test(store.toolStatus.textContent), store.toolStatus.textContent);

  console.log(failures ? '\n' + failures + ' UI check(s) failed' : '\nall UI checks passed');
  process.exit(failures ? 1 : 0);
}, 50);
