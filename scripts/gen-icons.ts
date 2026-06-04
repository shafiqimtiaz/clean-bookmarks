// Generates solid-color placeholder PNG icons (16/48/128) into public/icons.
// Replace with real artwork before publishing. Minimal PNG encoder using
// Node's zlib so we don't pull in an image dependency.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const COLOR = [37, 99, 235, 255]; // #2563eb

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(8 + body.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(4 + body.length, crc32(body));
  return out;
}

function png(size: number): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // remaining: compression/filter/interlace = 0

  const raw = new Uint8Array(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      raw[o++] = COLOR[0]!;
      raw[o++] = COLOR[1]!;
      raw[o++] = COLOR[2]!;
      raw[o++] = COLOR[3]!;
    }
  }
  const idat = new Uint8Array(deflateSync(raw));

  const ihdrC = chunk('IHDR', ihdr);
  const idatC = chunk('IDAT', idat);
  const iendC = chunk('IEND', new Uint8Array(0));

  const out = new Uint8Array(sig.length + ihdrC.length + idatC.length + iendC.length);
  let p = 0;
  for (const part of [sig, ihdrC, idatC, iendC]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`public/icons/icon${size}.png`, png(size));
}
console.log('Icons written -> public/icons/');
