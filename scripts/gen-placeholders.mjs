// Gera o personagem TEMPORÁRIO (placeholder), sem dependências externas, em
// apps/web/public/assets/placeholder/character/. Cada quadro leva a marca "PH" em magenta e o
// jogo mostra "ARTE PLACEHOLDER" na interface quando ele está em uso.
// O personagem placeholder (8 direções, 1 quadro cada) só aparece para classes que ainda
// não têm arte importada por npm run sprites:import. Uso: npm run placeholders
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'apps/web/public/assets/placeholder');
const T = 32;

// ---------- PNG mínimo (RGBA 8 bits) ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(img) {
  const { w, h, px } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- desenho ----------
const image = (w, h) => ({ w, h, px: Buffer.alloc(w * h * 4) });
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
function set(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  img.px[i] = c[0]; img.px[i + 1] = c[1]; img.px[i + 2] = c[2]; img.px[i + 3] = c[3];
}
function rect(img, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(img, x + i, y + j, c);
}
// marca "PH" 3x5 em magenta no canto superior esquerdo
const GLYPHS = { P: ['111', '101', '111', '100', '100'], H: ['101', '101', '111', '101', '101'] };
const MAGENTA = hex('#ff00ff');
function markPH(img, ox, oy) {
  rect(img, ox + 1, oy + 1, 9, 7, [0, 0, 0, 255]);
  ['P', 'H'].forEach((ch, k) => {
    GLYPHS[ch].forEach((row, y) => [...row].forEach((b, x) => b === '1' && set(img, ox + 2 + k * 4 + x, oy + 2 + y, MAGENTA)));
  });
}

// ---------- Personagem placeholder (desenho de um mago genérico) ----------
const C = {
  robe: hex('#2f5fb3'), robeDark: hex('#1f4180'), gold: hex('#e0b23a'), skin: hex('#f1c79b'),
  eye: hex('#1b1b1b'), staff: hex('#7a4f27'), crystal: hex('#5ec8ff'), crystalLight: hex('#c9f0ff'),
  boot: hex('#3a2a1c'), shadow: [0, 0, 0, 90],
};
function drawMage(img, ox, oy, dir, frame) {
  const bob = frame === 0 ? 0 : 1;
  const step = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  rect(img, ox + 9, oy + 29, 14, 2, C.shadow);
  // pés
  rect(img, ox + 12 + (dir === 'left' || dir === 'right' ? step : 0), oy + 27 + Math.min(0, step), 3, 2, C.boot);
  rect(img, ox + 17 - (dir === 'left' || dir === 'right' ? step : 0), oy + 27 + Math.min(0, -step), 3, 2, C.boot);
  // túnica
  const y0 = oy + 14 + bob;
  for (let j = 0; j < 13; j++) {
    const half = 4 + Math.floor(j / 3);
    rect(img, ox + 16 - half, y0 + j, half * 2, 1, j === 12 ? C.gold : C.robe);
  }
  rect(img, ox + 15, y0, 2, 12, dir === 'up' ? C.robeDark : C.gold); // faixa dourada central
  rect(img, ox + 11, y0 + 5, 10, 1, C.gold); // cinto
  // cabeça e capuz pontudo
  const hy = oy + 6 + bob;
  rect(img, ox + 12, hy + 2, 8, 7, dir === 'up' ? C.robeDark : C.skin);
  rect(img, ox + 11, hy, 10, 3, C.robe);
  rect(img, ox + 13, hy - 2, 6, 2, C.robe);
  rect(img, ox + 15, hy - 4, 3, 2, C.robe);
  rect(img, ox + 11, hy + 2, 10, 1, C.gold);
  if (dir === 'down') { set(img, ox + 14, hy + 5, C.eye); set(img, ox + 17, hy + 5, C.eye); }
  if (dir === 'left') { set(img, ox + 13, hy + 5, C.eye); rect(img, ox + 18, hy + 3, 3, 6, C.robe); }
  if (dir === 'right') { set(img, ox + 18, hy + 5, C.eye); rect(img, ox + 11, hy + 3, 3, 6, C.robe); }
  // cajado com cristal azul
  const sx = dir === 'left' ? ox + 7 : ox + 24;
  const sy = oy + 6 + bob;
  if (dir !== 'up') {
    rect(img, sx, sy + 3, 2, 20, C.staff);
    rect(img, sx - 1, sy, 4, 4, C.crystal);
    set(img, sx, sy + 1, C.crystalLight);
  } else {
    rect(img, sx, sy + 1, 2, 16, C.staff);
    rect(img, sx - 1, sy - 2, 4, 3, C.crystal);
  }
  markPH(img, ox, oy);
}

// Mesmos nomes de arquivo da arte real; as diagonais reaproveitam o desenho lateral.
const FACING_TO_DRAWING = {
  south: 'down', 'south-west': 'left', west: 'left', 'north-west': 'left',
  north: 'up', 'north-east': 'right', east: 'right', 'south-east': 'right',
};

mkdirSync(OUT, { recursive: true });
rmSync(join(OUT, 'tileset.png'), { force: true });
rmSync(join(OUT, 'mage.png'), { force: true });
const CHAR_OUT = join(OUT, 'character');
mkdirSync(CHAR_OUT, { recursive: true });
for (const [facing, drawing] of Object.entries(FACING_TO_DRAWING)) {
  const img = image(T, T);
  drawMage(img, 0, 0, drawing, 0);
  writeFileSync(join(CHAR_OUT, `${facing}.png`), encodePng(img));
}
console.log(`Placeholders gerados em ${OUT}: character/*.png`);
