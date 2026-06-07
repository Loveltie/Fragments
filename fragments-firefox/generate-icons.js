#!/usr/bin/env node
// Run once from the fragments/ folder:  node generate-icons.js
'use strict';

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ─────────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC[n] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = (c >>> 8) ^ CRC[(c ^ b) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG helpers ───────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(rgba, w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(0); // filter: None
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rows.push(rgba[i], rgba[i+1], rgba[i+2], rgba[i+3]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Geometry ──────────────────────────────────────────────────────────────
function inRoundedRect(px, py, w, h, r) {
  if (px < 0 || py < 0 || px > w || py > h) return false;
  if (px < r   && py < r)   return Math.hypot(px - r,   py - r)   <= r;
  if (px > w-r && py < r)   return Math.hypot(px-(w-r), py - r)   <= r;
  if (px < r   && py > h-r) return Math.hypot(px - r,   py-(h-r)) <= r;
  if (px > w-r && py > h-r) return Math.hypot(px-(w-r), py-(h-r)) <= r;
  return true;
}

function pointInPoly(px, py, verts) {
  let inside = false;
  for (let i = 0, j = verts.length-1; i < verts.length; j = i++) {
    const [xi,yi] = verts[i], [xj,yj] = verts[j];
    if (((yi > py) !== (yj > py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi))
      inside = !inside;
  }
  return inside;
}

// ── Draw ──────────────────────────────────────────────────────────────────
// Design: indigo #6366f1 rounded square + white 4-pointed sparkle
// Proportions are derived from the SVG path designed at 128px:
//   outerR = 44, innerOffset = 10 (inner vertices at ±10,±10 from center)
function drawIcon(size) {
  const rgba     = new Uint8Array(size * size * 4); // starts transparent
  const cx       = size / 2, cy = size / 2;
  const outerR   = size * (44 / 128);
  const innerOff = size * (10 / 128);
  const cornerR  = size * (22 / 128);

  const star = [
    [cx,             cy - outerR  ],
    [cx + innerOff,  cy - innerOff],
    [cx + outerR,    cy           ],
    [cx + innerOff,  cy + innerOff],
    [cx,             cy + outerR  ],
    [cx - innerOff,  cy + innerOff],
    [cx - outerR,    cy           ],
    [cx - innerOff,  cy - innerOff],
  ];

  // 4×4 supersampling for smooth edges
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sR = 0, sG = 0, sB = 0, sA = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let r = 0, g = 0, b = 0, a = 0;
          if (inRoundedRect(px, py, size, size, cornerR)) {
            r = 0xFF; g = 0xD7; b = 0x00; a = 255; // #FFD700 yellow
          }
          if (pointInPoly(px, py, star)) {
            r = 0x11; g = 0x11; b = 0x11; a = 255; // #111111 black
          }
          sR += r; sG += g; sB += b; sA += a;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i]   = Math.round(sR / n);
      rgba[i+1] = Math.round(sG / n);
      rgba[i+2] = Math.round(sB / n);
      rgba[i+3] = Math.round(sA / n);
    }
  }
  return rgba;
}

// ── Run ───────────────────────────────────────────────────────────────────
const assetsDir = path.join(__dirname, 'assets');
for (const size of [16, 48, 128]) {
  const rgba = drawIcon(size);
  const png  = encodePNG(rgba, size, size);
  const out  = path.join(assetsDir, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✓  icon${size}.png  (${png.length} bytes)`);
}
console.log('\nDone — reload the extension in chrome://extensions');
