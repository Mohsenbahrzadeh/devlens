// Creates release/devlens-<version>.zip from dist/ for upload to the Chrome Web Store.
// Dependency-free (own ZIP writer). Run `npm run build` first, or use `npm run package`.
import { deflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let files;
try {
  files = walk(dist).sort();
} catch {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}
const names = files.map((f) => relative(dist, f).split(sep).join(posix.sep));
for (const required of ['manifest.json', 'sidepanel.html', 'panel.html', 'background.js']) {
  if (!names.includes(required)) {
    console.error(`dist/${required} is missing; the build looks incomplete.`);
    process.exit(1);
  }
}
const stray = names.filter((n) => n.endsWith('.map'));
if (stray.length > 0) {
  console.error(`Source maps found in dist/: ${stray.join(', ')}`);
  process.exit(1);
}

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, keeps archives reproducible
const locals = [];
const centrals = [];
let offset = 0;

files.forEach((file, i) => {
  const data = readFileSync(file);
  const comp = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(names[i], 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, comp);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + comp.length;
});

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const outDir = join(root, 'release');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `devlens-${pkg.version}.zip`);
writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`${out}\n${files.length} files, ${(statSync(out).size / 1024).toFixed(1)} KB`);
