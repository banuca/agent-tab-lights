#!/usr/bin/env node
/*
 * Renders the extension icons from icons/icon.svg's geometry.
 *
 * Written by hand rather than pulled from a library because the project ships
 * no dependencies and the target environment has no raster toolchain (no
 * ImageMagick, rsvg-convert or inkscape). The shapes are flat circles on a
 * rounded rectangle, which is well within what a few lines of coverage maths
 * can draw cleanly.
 *
 * Run with: npm run icons
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, "..", "icons");

// Geometry in a 128-unit design space, matching icons/icon.svg.
const DESIGN = 128;
const CORNER_RADIUS = 28;
const DOT_RADIUS = 14;
const BACKGROUND = [0x1e, 0x24, 0x30];
const DOTS = [
  { y: 33, colour: [0xf4, 0x90, 0x0c] }, // working
  { y: 64, colour: [0xfd, 0xcb, 0x58] }, // waiting
  { y: 95, colour: [0x78, 0xb1, 0x59] } // done
];

const SIZES = [16, 32, 48, 128];

// ---------------------------------------------------------------- rendering

// Signed distance to a rounded rectangle, negative inside.
function roundedRectDistance(x, y, size, radius) {
  const half = size / 2;
  const dx = Math.abs(x - half) - (half - radius);
  const dy = Math.abs(y - half) - (half - radius);
  const outsideX = Math.max(dx, 0);
  const outsideY = Math.max(dy, 0);

  return (
    Math.hypot(outsideX, outsideY) + Math.min(Math.max(dx, dy), 0) - radius
  );
}

// Antialias by turning a signed distance into coverage across roughly one
// pixel. Cheaper and sharper at 16px than supersampling alone.
function coverage(distance) {
  return Math.min(1, Math.max(0, 0.5 - distance));
}

function blend(base, layer, alpha) {
  return [
    Math.round(base[0] + (layer[0] - base[0]) * alpha),
    Math.round(base[1] + (layer[1] - base[1]) * alpha),
    Math.round(base[2] + (layer[2] - base[2]) * alpha)
  ];
}

function renderPixels(size) {
  const scale = size / DESIGN;

  // Optical correction: at 16px a faithful scale puts each dot at ~3.5px, where
  // antialiasing washes it out. Fatten the dots and tighten the corners so the
  // traffic light still reads in a toolbar.
  const small = size <= 32;
  const radius = (small ? 22 : CORNER_RADIUS) * scale;
  const dotRadius = (small ? 17 : DOT_RADIUS) * scale;
  const centreX = (DESIGN / 2) * scale;

  // width * height * RGBA
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      const tileAlpha = coverage(roundedRectDistance(px, py, size, radius));

      let colour = BACKGROUND;

      for (const dot of DOTS) {
        const dotAlpha = coverage(
          Math.hypot(px - centreX, py - dot.y * scale) - dotRadius
        );

        if (dotAlpha > 0) {
          colour = blend(colour, dot.colour, dotAlpha);
        }
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = Math.round(tileAlpha * 255);
    }
  }

  return pixels;
}

// ------------------------------------------------------------------- encoding

const crcTable = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);

  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1
    );
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ----------------------------------------------------------------------- main

mkdirSync(iconsDir, { recursive: true });

for (const size of SIZES) {
  const file = join(iconsDir, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, renderPixels(size)));
  process.stdout.write(`wrote icons/icon-${size}.png\n`);
}
