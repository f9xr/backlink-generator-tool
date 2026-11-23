// tools/check-engine.js
// Runs backlink-generator.js against a stubbed DOM and checks URL normalisation,
// the placeholder map and template filling. No browser needed.
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('backlink-generator.js', 'utf8');

function makeSandbox() {
  const listeners = {};
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    decodeURIComponent,
    Blob: class {},
    AbortController,
    fetch: async () => ({ ok: true, json: async () => [], status: 200 }),
  };
  sandbox.document = {
    currentScript: null,
    cookie: '',
    readyState: 'complete',
    getElementById: () => null,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    createElement: () => ({
      style: {}, dataset: {}, classList: { add() {}, contains() { return false; } },
      appendChild() {}, setAttribute() {}, remove() {}, click() {},
      addEventListener() {}, querySelector: () => null,
    }),
    body: { appendChild() {} }
  };
  sandbox.location = {
    href: 'https://backlink.is-an.ai/demo/test.html',
    protocol: 'https:', origin: 'https://backlink.is-an.ai',
    pathname: '/demo/test.html', search: ''
  };
  sandbox.navigator = {};
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.history = { replaceState() {} };
  sandbox.document.defaultView = sandbox;
  return sandbox;
}

const sandbox = makeSandbox();
vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox, { filename: 'backlink-generator.js' });
} catch (e) {
  console.error('RUNTIME ERROR:', e.message);
  process.exit(1);
}
if (!sandbox.BacklinkGenerator) {
  console.error('RUNTIME ERROR: window.BacklinkGenerator was not created');
  process.exit(1);
}
console.log('engine evaluated without errors');

const api = sandbox.BacklinkGenerator;
let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n  expected: ' + expected + '\n  actual:   ' + actual));
}

// --- URL normalisation ---
check('keeps %2F', api.normalizeUrl('https://example.com/a%2Fb'), 'https://example.com/a%2Fb');
check('keeps %26 in query', api.normalizeUrl('https://example.com/search?q=a%26b'), 'https://example.com/search?q=a%26b');
check('keeps %3D', api.normalizeUrl('https://example.com/a%20b?q=%3D%3D'), 'https://example.com/a%20b?q=%3D%3D');
check('keeps www.', api.normalizeUrl('https://www.example.com/x'), 'https://www.example.com/x');
check('adds scheme', api.normalizeUrl('example.com/x'), 'https://example.com/x');
check('decodes full encoded url', api.normalizeUrl('https%3A%2F%2Fexample.com%2Fa'), 'https://example.com/a');
check('root slash trimmed', api.normalizeUrl('https://example.com/'), 'https://example.com');
check('rejects javascript:', api.normalizeUrl('javascript:alert(1)'), null);
check('rejects single word', api.normalizeUrl('halloworld'), null);
check('rejects ftp', api.normalizeUrl('ftp://example.com/x'), null);

// --- placeholder map ---
const map = api.buildMap('https://a.b.co.uk/path?x=1#top');
check('DOMAINNAME co.uk', map.DOMAINNAME, 'b');
check('TLD co.uk', map.TLD, 'co.uk');
check('SECOND_LEVEL_DOMAIN', map.SECOND_LEVEL_DOMAIN, 'b.co.uk');
check('SUBDOMAIN a.', map.SUBDOMAIN, 'a.');
const ipMap = api.buildMap('https://192.168.1.1/x');
check('IP DOMAINNAME', ipMap.DOMAINNAME, '192.168.1.1');
check('IP TLD', ipMap.TLD, '');
const localMap = api.buildMap('https://localhost/x');
check('localhost DOMAINNAME', localMap.DOMAINNAME, 'localhost');
check('localhost TLD', localMap.TLD, '');

// --- template filling ---
const url = api.normalizeUrl('https://example.com/a%2Fb?q=a%26b');
check('bare [URL] is inserted raw',
  api.generateUrl('https://t.example/go/[URL]', url),
  'https://t.example/go/' + url);
check('ENCODE_URL explicit',
  api.generateUrl('https://t.example/?u=[ENCODE_URL]', url),
  'https://t.example/?u=' + encodeURIComponent(url));
check('no implicit encoding of a bare URL',
  api.generateUrl('https://t.example/?url=[URL]', url),
  'https://t.example/?url=' + url);

// --- share url encoding ---
const share = api.generateUrl('https://t/?u=[ENCODE_URL]', url);
check('share-safe encoding', share.includes('%3A%2F%2F'), true);

console.log(failures ? '\n' + failures + ' check(s) failed' : '\nall checks passed');
process.exit(failures ? 1 : 0);
