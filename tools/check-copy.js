// tools/check-copy.js
// Guards the house copy rules: no emoji characters and no en/em dashes anywhere
// in the shipped text files. Fails with file:line so the fix is obvious.
'use strict';

const fs = require('fs');
const path = require('path');

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}]/u;
const LONG_DASH = /[\u2013\u2014]/;
const EXTENSIONS = new Set(['.html', '.htm', '.css', '.js', '.json', '.md', '.xml', '.txt']);
const SKIP = new Set(['.git', 'node_modules']);

const problems = [];

function scanDirectory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(full);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (EMOJI.test(line) || LONG_DASH.test(line)) {
        problems.push(path.relative('.', full) + ':' + (index + 1) + ': ' + line.trim().slice(0, 120));
      }
    });
  }
}

scanDirectory('.');

if (problems.length) {
  console.log('Emoji or long dash found in site copy:');
  for (const problem of problems) console.log('  ' + problem);
  console.log('\n' + problems.length + ' line(s) need rewriting.');
  process.exit(1);
}

console.log('OK - no emoji and no en/em dashes in site copy.');
