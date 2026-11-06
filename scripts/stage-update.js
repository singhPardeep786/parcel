const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const out = path.join(dist, 'updates');

function referenced(yml) {
  const text = fs.readFileSync(yml, 'utf8');
  const names = new Set();
  for (const match of text.matchAll(/(?:path|url):\s*['"]?([^'"\s#]+)/g)) {
    names.add(path.basename(match[1]));
  }
  return names;
}

function main() {
  if (!fs.existsSync(dist)) {
    console.error('dist folder nahi hai. Pehle npm run dist:all chalao.');
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });
  const manifests = fs.readdirSync(dist).filter((name) => /^latest.*\.yml$/.test(name));
  if (!manifests.length) {
    console.error('dist mein latest.yml nahi mila. Build publish config ke saath honi chahiye.');
    process.exit(1);
  }
  const files = new Set(manifests);
  for (const name of manifests) {
    for (const file of referenced(path.join(dist, name))) files.add(file);
  }
  let copied = 0;
  for (const name of files) {
    const from = path.join(dist, name);
    if (!fs.existsSync(from) || !fs.statSync(from).isFile()) {
      console.warn('missing', name);
      continue;
    }
    fs.copyFileSync(from, path.join(out, name));
    copied += 1;
  }
  for (const name of fs.readdirSync(out)) {
    if (files.has(name)) continue;
    const target = path.join(out, name);
    if (fs.statSync(target).isFile()) fs.unlinkSync(target);
  }
  const feed = require('../electron/feed.json').url;
  console.log(`copied ${copied} files to ${out}`);
  console.log(`upload this folder to ${feed}`);
}

main();
