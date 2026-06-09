/**
 * Generates placeholder PNG icons for the extension.
 * No external dependencies — uses Node.js built-ins only.
 * Run: node scripts/create-icons.mjs
 *
 * Brand color: #00C896 → RGB(0, 200, 150)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CRC32 (required for PNG chunk checksums) ─────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return Buffer.concat([u32be(d.length), t, d, u32be(crc32(Buffer.concat([t, d])))]);
}

/**
 * Creates a solid-color RGB PNG.
 * @param {number} size - Width and height in pixels
 * @param {number} r - Red channel 0-255
 * @param {number} g - Green channel 0-255
 * @param {number} b - Blue channel 0-255
 */
function createSolidPNG(size, r, g, b) {
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color type

  // Each row: filter byte (0=None) + R,G,B per pixel
  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    const base = y * rowBytes;
    raw[base] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = base + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Brand color: #00C896
const [R, G, B] = [0, 200, 150];

const iconsDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const png = createSolidPNG(size, R, G, B);
  const out = join(iconsDir, `icon-${size}.png`);
  writeFileSync(out, png);
  console.log(`  ✓ icon-${size}.png  (${png.length} bytes)`);
}

console.log('\nIcons generated in public/icons/');
