/**
 * Generates solid-color PNG icons for the extension.
 * Zero external dependencies — Node.js built-ins only (requires Node ≥ 20).
 *
 * Usage:
 *   node scripts/create-icons.mjs [options]
 *
 * Options:
 *   --color <hex>     Brand color, no '#' prefix (default: 00C896)
 *   --sizes <list>    Comma-separated pixel sizes  (default: 16,32,48,128)
 *   --out <dir>       Output dir relative to project root (default: public/icons)
 *   --alpha <0-255>   Alpha value; any value < 255 switches to RGBA mode (default: 255)
 *   --help            Show usage
 */

import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ── CLI ───────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    color: { type: 'string',  default: '00C896' },
    sizes: { type: 'string',  default: '16,32,48,128' },
    out:   { type: 'string',  default: 'public/icons' },
    alpha: { type: 'string',  default: '255' },
    help:  { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Usage: node scripts/create-icons.mjs [options]

  --color <hex>     Brand color hex, no '#' prefix (default: 00C896)
  --sizes <list>    Comma-separated pixel sizes    (default: 16,32,48,128)
  --out <dir>       Output dir, relative to root   (default: public/icons)
  --alpha <0-255>   Alpha value; <255 enables RGBA  (default: 255)
  `);
  process.exit(0);
}

// ── Config parsing ────────────────────────────────────────────────

/** Parse a hex color string (with or without '#') into [r, g, b]. */
function parseHex(hex) {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error(`Invalid color: #${clean}`);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

const [R, G, B] = parseHex(args.color);
const A = Math.max(0, Math.min(255, parseInt(args.alpha, 10)));
const RGBA_MODE = A < 255;

const SIZES = args.sizes.split(',').map(s => {
  const n = parseInt(s.trim(), 10);
  if (Number.isNaN(n) || n < 1 || n > 512) throw new Error(`Invalid size: "${s.trim()}"`);
  return n;
});

const OUT_DIR = resolve(PROJECT_ROOT, args.out);

// ── CRC32 (required by PNG spec for every chunk) ──────────────────

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

// ── PNG primitives ────────────────────────────────────────────────

/** Encode n as a 4-byte big-endian Buffer. */
function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

/** Build a PNG chunk: [length][type][data][CRC]. */
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return Buffer.concat([u32be(d.length), t, d, u32be(crc32(Buffer.concat([t, d])))]);
}

// ── Icon generator ────────────────────────────────────────────────

/**
 * Builds a solid-color PNG buffer.
 *
 * Supports RGB (color type 2) and RGBA (color type 6).
 * Includes an sRGB chunk to declare the color space, as recommended by
 * the PNG spec (https://www.w3.org/TR/png/#11sRGB) for device-accurate rendering.
 *
 * @param {number} size  Width and height in pixels
 * @param {number} r     Red channel (0–255)
 * @param {number} g     Green channel (0–255)
 * @param {number} b     Blue channel (0–255)
 * @param {number} [a]   Alpha channel (0–255). Values < 255 switch to RGBA mode.
 * @returns {Buffer}
 */
function createSolidPNG(size, r, g, b, a = 255) {
  const useAlpha = a < 255;
  const channels = useAlpha ? 4 : 3;

  // PNG file signature — always these 8 bytes
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR: width(4) height(4) bitDepth(1) colorType(1) compression(1) filter(1) interlace(1)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);       // width
  ihdr.writeUInt32BE(size, 4);       // height
  ihdr[8]  = 8;                      // bit depth: 8 bits per channel
  ihdr[9]  = useAlpha ? 6 : 2;       // color type: 2=RGB, 6=RGBA
  ihdr[10] = 0;                      // compression: deflate (only valid value)
  ihdr[11] = 0;                      // filter: adaptive (only valid value)
  ihdr[12] = 0;                      // interlace: none

  // sRGB chunk: rendering intent = Perceptual (0x00)
  // Declares pixels are in sRGB space; must appear before IDAT
  const srgb = pngChunk('sRGB', Buffer.from([0x00]));

  // Scanline data: each row = 1 filter byte (0=None) + N channels per pixel
  const rowBytes = 1 + size * channels;
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    const base = y * rowBytes;
    raw[base] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const px = base + 1 + x * channels;
      raw[px]     = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      if (useAlpha) raw[px + 3] = a;
    }
  }

  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    srgb,
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Run ───────────────────────────────────────────────────────────

try {
  mkdirSync(OUT_DIR, { recursive: true });

  const colorLabel = `#${args.color.replace('#', '').toUpperCase()}`;
  console.log(`\nGenerating icons → ${args.out}`);
  console.log(`  Color : ${colorLabel}${RGBA_MODE ? `  alpha: ${A}` : ''}`);
  console.log(`  Sizes : ${SIZES.join(', ')}px\n`);

  let totalBytes = 0;
  for (const size of SIZES) {
    const png = createSolidPNG(size, R, G, B, A);
    writeFileSync(join(OUT_DIR, `icon-${size}.png`), png);
    totalBytes += png.length;
    console.log(`  ✓ icon-${size}.png  (${png.length} bytes)`);
  }

  console.log(`\nDone — ${SIZES.length} file(s), ${totalBytes} bytes total\n`);
} catch (err) {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
}
