// tools/check-links.js
// Audits internal links, assets and #anchors on every maintained page.
// External URLs are not fetched; they are checked for a scheme only.
//
// Usage: node tools/check-links.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = [
  'index.html',
  '404.html',
  'how-it-works.html',
  'report-problem.html',
  'pages/sitemap.html',
  'pages/terms.html',
  'pages/privacy.html',
  'pages/refund.html',
  'pages/affiliate-disclosure.html',
  'pages/transparency.html',
  'pages/dmca.html'
];

const errors = [];
let checked = 0;

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function idsOf(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const ids = new Set();
  for (const match of html.matchAll(/\sid="([^"]+)"/g)) ids.add(match[1]);
  for (const match of html.matchAll(/\sname="([^"]+)"/g)) ids.add(match[1]);
  return ids;
}

const idCache = new Map();
function idsFor(file) {
  if (!idCache.has(file)) idCache.set(file, idsOf(file));
  return idCache.get(file);
}

function resolveTarget(fromFile, target) {
  const clean = target.split('#')[0].split('?')[0];
  if (!clean) return fromFile;
  if (clean.startsWith('/')) return clean.slice(1);
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
}

for (const file of PAGES) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    errors.push(file + ': page is missing');
    continue;
  }

  const html = stripComments(fs.readFileSync(full, 'utf8'));
  const refs = [];
  for (const match of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) refs.push(match[1]);

  for (const ref of refs) {
    if (!ref || ref.startsWith('data:') || ref.startsWith('javascript:') || ref.startsWith('tel:')) continue;
    if (/^mailto:/i.test(ref)) continue;
    if (/^https?:\/\//i.test(ref)) continue;
    if (ref.startsWith('//')) {
      errors.push(file + ': protocol-relative URL ' + ref);
      continue;
    }

    checked += 1;
    const hash = ref.includes('#') ? ref.split('#')[1] : '';
    let target = resolveTarget(file, ref);

    // A directory or a trailing slash resolves to its index page.
    if (target.endsWith('/')) target += 'index.html';
    const targetFull = path.join(ROOT, target);
    if (!fs.existsSync(targetFull) || fs.statSync(targetFull).isDirectory()) {
      const indexed = path.join(targetFull, 'index.html');
      if (!fs.existsSync(indexed)) {
        errors.push(file + ': broken link ' + ref);
        continue;
      }
      target = path.posix.join(target, 'index.html');
    }

    if (hash && target.endsWith('.html')) {
      if (!idsFor(target).has(hash)) {
        errors.push(file + ': missing anchor #' + hash + ' in ' + target);
      }
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error('FAIL ' + error);
  console.error('\n' + errors.length + ' broken link(s) found.');
  process.exit(1);
}
console.log('OK - ' + PAGES.length + ' pages, ' + checked + ' internal links and anchors checked.');
