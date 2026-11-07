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
  const cx = 0.5;
  const cy = 0.5;
  const half = 0.34;
  const radius = 0.07;
  const dx = Math.abs(nx - cx);
  const dy = Math.abs(ny - cy);
  const inside =
    dx <= half - radius && dy <= half
      ? true
      : dy <= half - radius && dx <= half
        ? true
        : (dx - (half - radius)) ** 2 + (dy - (half - radius)) ** 2 <= radius * radius;
  if (!inside) return [0, 0, 0, 0];

  // Soft drop shadow fringe near the outer edge
  const edge = Math.min(half - dx, half - dy);
  let r = 154;
  let g = 100;
  let b = 52;

  // Horizontal wood plank lines (top-down crate)
  const plank = Math.floor((ny - (cy - half)) / (half * 2) * 8);
  if (plank % 2 === 1) {
    r = 110;
    g = 63;
    b = 28;
  }

  // Dark outline ring
  if (edge < 0.028) {
    r = 26;
    g = 18;
    b = 12;
  }

  // Cross straps (packing tape)
  const strap = 0.045;
  if (Math.abs(nx - cx) < strap || Math.abs(ny - cy) < strap) {
    r = 217;
    g = 178;
    b = 92;
    if (edge < 0.028) {
      r = 26;
      g = 18;
      b = 12;
    }
  }

  return [r, g, b, 255];
}

function paintTray(x, y, s) {
  const nx = (x + 0.5) / s;
  const ny = (y + 0.5) / s;
  const cx = 0.5;
  const cy = 0.5;
  const half = 0.32;
  const inside = Math.abs(nx - cx) < half && Math.abs(ny - cy) < half;
  if (!inside) return [0, 0, 0, 0];
  const strap = 0.05;
  if (Math.abs(nx - cx) < strap || Math.abs(ny - cy) < strap) return [0, 0, 0, 230];
  return [0, 0, 0, 200];
}

module.exports = { encodePNG, paintAppIcon, paintTray };
