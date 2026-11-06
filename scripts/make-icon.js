const fs = require('fs');
const path = require('path');
const { encodePNG, paintAppIcon } = require('../electron/png');

const assets = path.join(__dirname, '..', 'assets');
const png = path.join(assets, 'icon.png');
fs.writeFileSync(png, encodePNG(512, paintAppIcon));

function encodeICO(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + entries.length;
  images.forEach((image, index) => {
    const at = index * 16;
    const dim = image.size >= 256 ? 0 : image.size;
    entries[at] = dim;
    entries[at + 1] = dim;
    entries.writeUInt16LE(1, at + 4);
    entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(image.png.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += image.png.length;
  });
  return Buffer.concat([header, entries, ...images.map((image) => image.png)]);
}

const sizes = [16, 32, 48, 64, 128, 256];
const ico = path.join(assets, 'icon.ico');
fs.writeFileSync(ico, encodeICO(sizes.map((size) => ({ size, png: encodePNG(size, paintAppIcon) }))));
console.log('wrote', png);
console.log('wrote', ico);
