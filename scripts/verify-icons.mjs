/**
 * Verifies that generated icons are valid, spec-compliant PNGs.
 * Checks: signature, IHDR dimensions & color type, sRGB chunk presence.
 * Zero external dependencies — Node.js built-ins only.
 *
 * Usage:
 *   node scripts/verify-icons.mjs [options]
 *
 * Options:
 *   --sizes <list>   Sizes to verify (default: 16,32,48,128)
 *   --out <dir>      Icon dir relative to project root (default: public/icons)
 *   --strict         Fail if sRGB chunk is absent (default: warn only)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ── CLI ───────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    sizes: { type: 'string', default: '16,32,48,128' },
    out: { type: 'string', default: 'public/icons' },
    strict: { type: 'boolean', default: false },
  },
  strict: false,
});

const SIZES = args.sizes.split(',').map((s) => Number.parseInt(s.trim(), 10));
const ICONS_DIR = resolve(PROJECT_ROOT, args.out);

// ── PNG parsing helpers ───────────────────────────────────────────

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Read big-endian uint32 from buf at offset. */
function readU32(buf, offset) {
  return buf.readUInt32BE(offset);
}

/**
 * Walk PNG chunks in buf starting at offset 8 (after signature).
 * Returns an array of { type, offset, length } for every chunk found.
 */
function listChunks(buf) {
  const chunks = [];
  let pos = 8; // skip PNG signature
  while (pos + 12 <= buf.length) {
    const length = readU32(buf, pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    chunks.push({ type, offset: pos, length });
    pos += 12 + length; // length(4) + type(4) + data(length) + crc(4)
    if (type === 'IEND') break;
  }
  return chunks;
}

/** Parse IHDR data from a chunk buffer (starting at chunk offset). */
function parseIHDR(buf, chunkOffset) {
  const dataStart = chunkOffset + 8; // skip length(4) + type(4)
  return {
    width: readU32(buf, dataStart),
    height: readU32(buf, dataStart + 4),
    bitDepth: buf[dataStart + 8],
    colorType: buf[dataStart + 9], // 2=RGB, 3=Indexed, 4=Grayscale+A, 6=RGBA
    interlace: buf[dataStart + 12],
  };
}

// Color type labels for readable output
const COLOR_TYPES = { 0: 'Grayscale', 2: 'RGB', 3: 'Indexed', 4: 'Grayscale+A', 6: 'RGBA' };

// ── Verification ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warned = 0;

console.log(`\nVerifying icons in ${args.out}\n`);

for (const size of SIZES) {
  const filePath = join(ICONS_DIR, `icon-${size}.png`);
  const label = `icon-${size}.png`;
  const issues = [];
  const warnings = [];

  // 1. File exists
  if (!existsSync(filePath)) {
    console.log(`  ✗ ${label}  — file not found`);
    failed++;
    continue;
  }

  const buf = readFileSync(filePath);

  // 2. PNG signature (first 8 bytes must match exactly)
  if (!buf.slice(0, 8).equals(PNG_SIG)) {
    issues.push('invalid PNG signature');
  }

  // 3. Parse chunks
  const chunks = listChunks(buf);
  const chunkTypes = chunks.map((c) => c.type);

  // 4. Required chunks: IHDR, IDAT, IEND in correct order
  if (chunkTypes[0] !== 'IHDR') issues.push('IHDR is not the first chunk');
  if (!chunkTypes.includes('IDAT')) issues.push('missing IDAT chunk');
  if (chunkTypes[chunkTypes.length - 1] !== 'IEND') issues.push('IEND is not the last chunk');

  // 5. IHDR content: expected NxN, 8-bit, RGB or RGBA, no interlace
  const ihdrChunk = chunks.find((c) => c.type === 'IHDR');
  let ihdr = null;
  if (ihdrChunk) {
    ihdr = parseIHDR(buf, ihdrChunk.offset);

    if (ihdr.width !== size) issues.push(`width ${ihdr.width} ≠ expected ${size}`);
    if (ihdr.height !== size) issues.push(`height ${ihdr.height} ≠ expected ${size}`);
    if (ihdr.bitDepth !== 8) issues.push(`bit depth ${ihdr.bitDepth} (expected 8)`);
    if (![2, 6].includes(ihdr.colorType)) {
      issues.push(
        `color type ${ihdr.colorType} (${COLOR_TYPES[ihdr.colorType] ?? 'unknown'}) — expected RGB(2) or RGBA(6)`,
      );
    }
    if (ihdr.interlace !== 0) warnings.push('interlaced PNG (not recommended for icons)');
  }

  // 6. sRGB chunk — should appear before IDAT for color accuracy
  const hasSRGB = chunkTypes.includes('sRGB');
  if (!hasSRGB) {
    const msg = 'missing sRGB chunk (color space undeclared)';
    args.strict ? issues.push(msg) : warnings.push(msg);
  }

  // 7. File size sanity: minimum viable PNG is ~67 bytes; flag suspiciously large icons
  if (buf.length < 67) issues.push(`file too small (${buf.length} bytes)`);

  // Report
  const colorTypeStr = ihdr
    ? ` ${ihdr.width}×${ihdr.height} ${COLOR_TYPES[ihdr.colorType] ?? `type${ihdr.colorType}`}`
    : '';
  const srgbStr = hasSRGB ? ' sRGB✓' : '';

  if (issues.length > 0) {
    console.log(`  ✗ ${label}  (${buf.length}B${colorTypeStr}${srgbStr})`);
    for (const i of issues) console.log(`      ✗ ${i}`);
    failed++;
  } else {
    const warnStr = warnings.length ? `  ⚠ ${warnings.join(' | ')}` : '';
    console.log(`  ✓ ${label}  (${buf.length}B${colorTypeStr}${srgbStr})${warnStr}`);
    if (warnings.length) warned++;
    passed++;
  }
}

// ── Summary ───────────────────────────────────────────────────────

console.log(`\n  ${passed} passed  ${failed} failed  ${warned} warned\n`);

if (failed > 0) process.exit(1);
