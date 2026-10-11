// Generates public/icons/icon{16,48,128}.png (indigo rounded square with a lens ring).
// Dependency-free: run with `node scripts/make-icons.mjs`.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const cx = x + 0.5 - r;
      const cy = y + 0.5 - r;
      const corner = size * 0.22;
      const ax = Math.max(Math.abs(cx) - (r - corner), 0);
      const ay = Math.max(Math.abs(cy) - (r - corner), 0);
      const inside = Math.hypot(ax, ay) <= corner;
      const d = Math.hypot(cx - size * 0.04, cy - size * 0.04);
      const ring = d >= size * 0.2 && d <= size * 0.32;
      const handle =
        Math.abs(cx - cy) < size * 0.05 && cx > size * 0.12 && cx < size * 0.34 && cy > size * 0.12;
      const [R, G, B, A] = !inside
        ? [0, 0, 0, 0]
        : ring || handle
          ? [255, 255, 255, 255]
          : [79, 70, 229, 255];
      raw.set([R, G, B, A], i);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const s of [16, 48, 128]) writeFileSync(`public/icons/icon${s}.png`, png(s));
