const { execSync } = require('child_process');
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

function isReleaseFile(name) {
  return /^latest.*\.yml$/i.test(name) || /\.(dmg|zip|exe|AppImage|blockmap|deb|rpm)$/i.test(name);
}

function publishTo(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    const target = path.join(dir, name);
    if (!fs.statSync(target).isFile() || !isReleaseFile(name) || files.has(name)) continue;
    fs.unlinkSync(target);
  }
  let copied = 0;
  for (const name of files) {
    const from = path.join(dist, name);
    if (!fs.existsSync(from) || !fs.statSync(from).isFile()) {
      console.warn('missing', name);
      continue;
    }
    fs.copyFileSync(from, path.join(dir, name));
    copied += 1;
  }
  return copied;
}

function main() {
  if (!fs.existsSync(dist)) {
    console.error('dist folder nahi hai. Pehle npm run dist:all chalao.');
    process.exit(1);
  }
  const manifests = fs.readdirSync(dist).filter((name) => /^latest.*\.yml$/.test(name));
  if (!manifests.length) {
    console.error('dist mein latest.yml nahi mila. Build publish config ke saath honi chahiye.');
    process.exit(1);
  }
  const files = new Set(manifests);
  for (const name of manifests) {
    for (const file of referenced(path.join(dist, name))) files.add(file);
  }
  for (const name of [...files]) {
    const block = `${name}.blockmap`;
    if (fs.existsSync(path.join(dist, block))) files.add(block);
  }
  const site = path.join(__dirname, '..', 'public');
  const copied = publishTo(out, files);
  const downloadBase = releaseBase();
  fs.mkdirSync(site, { recursive: true });
  for (const name of fs.readdirSync(site)) {
    const target = path.join(site, name);
    if (!fs.statSync(target).isFile() || !isReleaseFile(name)) continue;
    if (!/^latest.*\.yml$/i.test(name)) fs.unlinkSync(target);
  }
  for (const name of manifests) {
    fs.writeFileSync(path.join(site, name), feedYml(name, downloadBase));
  }
  const feed = require('../electron/feed.json').url;
  console.log(`copied ${copied} files to ${out}`);
  console.log(`wrote ${manifests.length} feed files to ${site}`);
  console.log(`installed apps read ${feed}`);
  console.log(`installers download from ${downloadBase}`);
}

function releaseBase() {
  const version = require('../package.json').version;
  let remote = 'https://github.com/singhPardeep786/parcel.git';
  try {
    remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  } catch {
    // keep the fallback remote
  }
  const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  const repo = match ? `${match[1]}/${match[2]}` : 'singhPardeep786/parcel';
  return `https://github.com/${repo}/releases/download/v${version}`;
}

function feedYml(name, downloadBase) {
  const text = fs.readFileSync(path.join(dist, name), 'utf8');
  return text.replace(/^(\s*-?\s*url:\s*)(\S+)\s*$/gm, (_line, prefix, file) => {
    if (/^https?:\/\//i.test(file)) return `${prefix}${file}`;
    return `${prefix}${downloadBase}/${path.basename(file)}`;
  });
}

main();
