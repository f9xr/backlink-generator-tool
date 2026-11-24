// tools/build-site-files.js
// Generates sitemap.xml, robots.txt and demo/index.html from the current demo
// page list. Run after adding or renaming a demo page. 404.html is a hand-
// maintained static page, so this script does not overwrite it.
//
// Usage: node tools/build-site-files.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo');
const SITE = 'https://backlink.is-an.ai';
const LAST_MOD = '2026-11-23';

const ACRONYMS = new Set(['seo', 'ai', 'csv', 'faq', 'url', 'api', 'serp', 'html', 'ppc', 'sem', 'roi']);
const keywordFromSlug = file => file.replace(/\.html$/, '').split('-').map(w => {
  const l = w.toLowerCase();
  if (ACRONYMS.has(l)) return l.toUpperCase();
  if (l === 'youtube') return 'YouTube';
  return l.charAt(0).toUpperCase() + l.slice(1);
}).join(' ');

const escapeHtml = v => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pages = fs.readdirSync(DEMO).filter(f => f.endsWith('.html') && f !== 'index.html').sort();

// ---------- sitemap ----------
// Search engines ignore <priority>/<changefreq>, so only <loc> and <lastmod> are emitted.
const entries = [SITE + '/', SITE + '/demo/'].concat(pages.map(f => SITE + '/demo/' + f));

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map(loc =>
    '  <url>\n    <loc>' + loc + '</loc>\n    <lastmod>' + LAST_MOD + '</lastmod>\n  </url>'
  ),
  '</urlset>',
  ''
].join('\n');
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

// ---------- robots ----------
const robots = [
  'User-agent: *',
  'Allow: /',
  '',
  'Sitemap: ' + SITE + '/sitemap.xml',
  ''
].join('\n');
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf8');

// ---------- demo index ----------
const groups = new Map();
for (const file of pages) {
  const letter = file.charAt(0).toUpperCase();
  if (!groups.has(letter)) groups.set(letter, []);
  groups.get(letter).push(file);
}

const listHtml = [...groups.keys()].sort().map(letter => {
  const items = groups.get(letter).map(file =>
    '      <li><a href="./' + file + '">' + escapeHtml(keywordFromSlug(file)) + '</a></li>'
  ).join('\n');
  return '    <section class="letter" aria-labelledby="letter-' + letter + '">\n' +
    '      <h2 id="letter-' + letter + '">' + letter + '</h2>\n' +
    '      <ul>\n' + items + '\n      </ul>\n    </section>';
}).join('\n');

const demoIndex = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Backlink Generator Demo Pages - ${pages.length} Keyword Variants</title>
  <meta name="description" content="Browse all ${pages.length} demo pages of the free Backlink Generator Tool: one keyword-focused landing page per SEO use case, each running the same client-side engine.">
  <link rel="canonical" href="${SITE}/demo/">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="theme-color" content="#2563eb">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Backlink Generator Demo Pages">
  <meta property="og:description" content="${pages.length} keyword-focused demo pages running the same free client-side backlink engine.">
  <meta property="og:url" content="${SITE}/demo/">
  <link rel="stylesheet" href="../styles.css">
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #0f172a; }
    header, main, footer .inner { max-width: 1080px; margin: 0 auto; padding: 0 18px; }
    header { padding-top: 28px; padding-bottom: 8px; }
    header h1 { font-size: clamp(1.5rem, 3.4vw, 2.1rem); margin: 0 0 8px; }
    header p { color: #475569; margin: 0 0 10px; }
    main { padding-bottom: 30px; }
    .letter { border-top: 1px solid #e5e7eb; padding: 16px 0; }
    .letter h2 { font-size: 1rem; color: #1d4ed8; margin: 0 0 8px; }
    .letter ul { margin: 0; padding-left: 20px; columns: 2; column-gap: 28px; }
    .letter li { margin-bottom: 4px; break-inside: avoid; }
    .letter a { color: #1f2937; text-decoration: none; font-size: .94rem; }
    .letter a:hover { color: #1d4ed8; text-decoration: underline; }
    @media (max-width: 640px) { .letter ul { columns: 1; } }
  </style>
</head>
<body>
  <header>
    <h1>Backlink Generator demo pages</h1>
    <p>${pages.length} keyword-focused landing pages, each running the same free client-side engine.
      <a href="../index.html">Open the main tool</a>.</p>
  </header>
  <main>
${listHtml}
  </main>
  <footer class="bgt-footer">
    <div class="inner">
      <p>Backlink Generator Tool - free, client-side SEO utility.</p>
      <p>Enhanced by <a href="https://f9xr.org" target="_blank" rel="noopener">F9XR Team</a></p>
    </div>
  </footer>
</body>
</html>
`;
fs.writeFileSync(path.join(DEMO, 'index.html'), demoIndex, 'utf8');

console.log('sitemap.xml:', entries.length, 'urls');
console.log('robots.txt and demo/index.html written');
