const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = (size * 4 + 1) * y;
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRoundRect(nx, ny, rad) {
  const l = rad;
  const r = 1 - rad;
  const cx = Math.max(l, Math.min(nx, r));
  const cy = Math.max(l, Math.min(ny, r));
  const dx = nx - cx;
  const dy = ny - cy;
  return dx * dx + dy * dy <= rad * rad && nx >= 0 && ny >= 0 && nx <= 1 && ny <= 1;
}

function paintAppIcon(x, y, s) {
  const nx = (x + 0.5) / s;
  const ny = (y + 0.5) / s;
  if (!inRoundRect(nx, ny, 0.22)) return [0, 0, 0, 0];
  const shade = 1 - (ny - 0.2) * 0.18;
  let r = 36 * shade;
  let g = 27 * shade;
  let b = 22 * shade;

  const cx = 0.52;
  const cy = 0.56;
  const hw = 0.26;
  const hh = 0.2;
  const top = ny > cy - hh - 0.1 && ny < cy - hh + 0.02;
  const inBody = Math.abs(nx - cx) < hw && ny > cy - hh && ny < cy + hh;
  const inTop = Math.abs(nx - cx) < hw * 0.92 && Math.abs(ny - (cy - hh)) < 0.055 && Math.abs(nx - cx) / hw + (cy - hh - ny) * 2 < 1.15;

  if (inBody) {
    const edge = Math.min(hw - Math.abs(nx - cx), cy + hh - ny, ny - (cy - hh));
    const dark = edge < 0.015 ? 0.72 : 1;
    r = 214 * dark;
    g = 168 * dark;
    b = 106 * dark;
    if (Math.abs(nx - cx) < 0.028) {
      r = 232;
      g = 206;
      b = 150;
    }
  }
  if (inTop && !inBody) {
    r = 232;
    g = 196;
    b = 132;
  }
  if (inBody && ny > cy - 0.02 && ny < cy + 0.045 && Math.abs(nx - cx) < hw * 0.62) {
    r = 255;
    g = 248;
    b = 236;
  }
  if (inBody && ny > cy + 0.055 && ny < cy + 0.09 && Math.abs(nx - cx) < 0.1) {
    r = 224;
    g = 122;
    b = 47;
  }

  const hx = 0.3;
  const hy = 0.34;
  const dx = nx - hx;
  const dy = ny - hy;
  if (dx * dx + dy * dy < 0.012) {
    r = 240;
    g = 236;
    b = 230;
  }
  if (dx * dx * 1.4 + (ny - 0.3) * (ny - 0.3) < 0.004 && ny < 0.31) {
    r = 224;
    g = 122;
    b = 47;
  }
  return [Math.max(0, Math.min(255, r | 0)), Math.max(0, Math.min(255, g | 0)), Math.max(0, Math.min(255, b | 0)), 255];
}

function paintTray(x, y, s) {
  const nx = (x + 0.5) / s;
  const ny = (y + 0.5) / s;
  const cx = 0.5;
  const cy = 0.58;
  const hw = 0.28;
  const hh = 0.22;
  const inBody = Math.abs(nx - cx) < hw && ny > cy - hh && ny < cy + hh;
  const inTop = Math.abs(nx - cx) < hw && ny > cy - hh - 0.12 && ny <= cy - hh && Math.abs(nx - cx) < hw * (1 - (cy - hh - ny) / 0.16);
  if (inBody || inTop) return [0, 0, 0, 230];
  return [0, 0, 0, 0];
}

module.exports = { encodePNG, paintAppIcon, paintTray };
