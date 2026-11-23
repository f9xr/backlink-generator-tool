// tools/validate-site.js
// Guards the invariants this repo kept breaking:
//   - template JSON parses, has no duplicates and no malformed entries
//   - every template generates a usable http(s) URL
//   - every demo page declares charset, lang, viewport, description, canonical
//   - no page keeps <style> in <body>, duplicate ids or duplicate titles
//   - every demo page loads the engine and the hidden-iframe stylesheet
//   - robots.txt and sitemap.xml exist and the sitemap covers every page
//
// Usage: node tools/validate-site.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo');
const errors = [];
const warnings = [];

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
  } catch (e) {
    errors.push(name + ': ' + e.message);
    return null;
  }
}

// ---------- template data ----------
const generic = readJson('backlink-templates.json');
const youtube = readJson('youtube-backlink-templates.json');
const proxies = readJson('cors-proxies.json');

for (const [name, list] of [['backlink-templates.json', generic], ['youtube-backlink-templates.json', youtube], ['cors-proxies.json', proxies]]) {
  if (!list) continue;
  if (!Array.isArray(list) || !list.length) {
    errors.push(name + ': must be a non-empty array');
    continue;
  }
  const seen = new Set();
  for (const tpl of list) {
    if (typeof tpl !== 'string' || !tpl.trim()) {
      errors.push(name + ': empty or non-string entry');
      continue;
    }
    if (seen.has(tpl)) errors.push(name + ': duplicate entry ' + tpl.slice(0, 80));
    seen.add(tpl);
    if (/\s/.test(tpl)) errors.push(name + ': whitespace inside template ' + tpl.slice(0, 80));
    if (!/^https?:\/\//i.test(tpl)) errors.push(name + ': missing scheme ' + tpl.slice(0, 80));
    if (!/\[[A-Z0-9_]+\]|\{\{[A-Z0-9_]+\}\}/.test(tpl)) warnings.push(name + ': no placeholder in ' + tpl.slice(0, 80));
  }
}

if (proxies) {
  for (const tpl of proxies) {
    if (/corsproxy\.io/i.test(tpl) && !/[?&]url=/i.test(tpl)) {
      errors.push('cors-proxies.json: corsproxy.io needs ?url= — ' + tpl);
    }
  }
}

// ---------- demo pages ----------
const pages = fs.readdirSync(DEMO).filter(f => f.endsWith('.html') && f !== 'index.html');
const titles = new Map();

for (const file of pages) {
  const html = fs.readFileSync(path.join(DEMO, file), 'utf8');
  const fail = message => errors.push('demo/' + file + ': ' + message);

  if (!/<html[^>]*\slang="[a-z-]+"/i.test(html)) fail('missing html lang');
  if (!/<meta charset="utf-8">/i.test(html)) fail('missing charset');
  if (!/<meta name="viewport"/i.test(html)) fail('missing viewport');
  if (!/<meta name="description" content="[^"]{40,}"/i.test(html)) fail('missing description');
  if (!/<link rel="canonical"/i.test(html)) fail('missing canonical');
  if (/<body[^>]*>[\s\S]*<style\b/i.test(html)) fail('<style> inside body');
  if (!html.includes('stealth-iframe.css')) fail('missing stealth-iframe.css');
  if (!html.includes('backlink-generator.js')) fail('missing engine script');
  if (!/<h1[\s>]/i.test(html)) fail('missing h1');
  if ((html.match(/<h1[\s>]/gi) || []).length > 1) fail('more than one h1');
  if (html.includes('backlink-generator-tool.github.io')) fail('absolute github.io asset URL');
  if (!html.includes('f9xr.org')) fail('missing F9XR footer credit');

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) fail('duplicate ids: ' + [...new Set(dupes)].slice(0, 5).join(', '));

  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1];
  if (!title.trim()) fail('missing title');
  if (titles.has(title)) fail('duplicate title with ' + titles.get(title));
  titles.set(title, file);
}

// ---------- required files ----------
for (const file of ['robots.txt', 'sitemap.xml', '404.html', 'demo/index.html', 'LICENSE', '.gitignore', 'index.html']) {
  if (!fs.existsSync(path.join(ROOT, file))) errors.push('missing ' + file);
}

if (fs.existsSync(path.join(ROOT, 'sitemap.xml'))) {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
  for (const file of pages) {
    if (!locs.has('https://backlink.is-an.ai/demo/' + file)) {
      errors.push('sitemap.xml: missing demo/' + file);
      break;
    }
  }
}

for (const warning of warnings) console.log('WARN ' + warning);
for (const error of errors) console.error('FAIL ' + error);

if (errors.length) {
  console.error('\n' + errors.length + ' problem(s) found.');
  process.exit(1);
}
console.log('OK — ' + pages.length + ' demo pages and 3 data files validated.');
