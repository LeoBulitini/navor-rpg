// Gera a arte TEMPORÁRIA (placeholder) da Fase 1, sem dependências externas.
// Todos os arquivos saem em apps/web/public/assets/placeholder/. Cada quadro de personagem
// leva a marca "PH" em magenta e cada tile um ponto magenta 2x2 no canto (uma marca "PH"
// por tile poluía demais a tela); o jogo também mostra "ARTE PLACEHOLDER" na interface.
// Para usar arte real: coloque os PNGs em public/assets/final/ e aponte o
// apps/web/src/assets/manifest.json para eles. Uso: npm run placeholders
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'apps/web/public/assets/placeholder');
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
// ruído determinístico (sem Math.random) para a arte ser idêntica a cada geração
function noise(x, y, seed) {
  let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
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

// ---------- tileset ----------
function textured(img, ox, base, dark, light, seed, density = 0.12) {
  rect(img, ox, 0, T, T, hex(base));
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = noise(x, y, seed);
      if (n < density) set(img, ox + x, y, hex(dark));
      else if (n > 1 - density / 2) set(img, ox + x, y, hex(light));
    }
}
const TILE_PAINTERS = {
  grass: (img, ox) => textured(img, ox, '#4a8f3c', '#3b7530', '#62a84f', 1),
  path: (img, ox) => textured(img, ox, '#a8865a', '#8f6f47', '#bf9d70', 2),
  wall: (img, ox) => {
    rect(img, ox, 0, T, T, hex('#6b6f78'));
    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      rect(img, ox, y, T, 1, hex('#3f424a'));
      const shift = row % 2 ? 8 : 0;
      for (let x = shift; x < T; x += 16) rect(img, ox + x, y, 1, 8, hex('#3f424a'));
      rect(img, ox, y + 1, T, 1, hex('#858a94'));
    }
  },
  tree: (img, ox) => {
    TILE_PAINTERS.grass(img, ox);
    rect(img, ox + 13, 20, 6, 10, hex('#5b3a1e'));
    for (let y = 2; y < 24; y++)
      for (let x = 3; x < 29; x++) {
        const d = Math.hypot(x - 16, y - 12);
        if (d < 12) set(img, ox + x, y, hex(d < 9 && noise(x, y, 7) > 0.3 ? '#2f6b2a' : '#1f4f1c'));
      }
  },
  rock: (img, ox) => {
    TILE_PAINTERS.grass(img, ox);
    for (let y = 6; y < 28; y++)
      for (let x = 4; x < 28; x++) {
        const d = Math.hypot((x - 16) / 12, (y - 18) / 10);
        if (d < 1) set(img, ox + x, y, hex(d < 0.6 && y < 18 ? '#a3a6ad' : '#7c8089'));
      }
  },
  water: (img, ox) => {
    rect(img, ox, 0, T, T, hex('#2c5d9e'));
    for (let y = 3; y < T; y += 8)
      for (let x = 0; x < T; x++) if ((x + y) % 8 < 3) set(img, ox + x, y + ((x >> 2) % 2), hex('#5b8fd1'));
  },
};

function buildTileset() {
  const { tiles } = JSON.parse(readFileSync(join(ROOT, 'content/tiles.json'), 'utf8'));
  const cols = Math.max(...tiles.map((t) => t.index)) + 1;
  const img = image(cols * T, T);
  for (const t of tiles) {
    const paint = TILE_PAINTERS[t.id];
    if (!paint) throw new Error(`Sem desenho placeholder para o tile "${t.id}"`);
    paint(img, t.index * T);
    rect(img, t.index * T, 0, 2, 2, MAGENTA);
  }
  return img;
}

// ---------- Mago: 3 colunas (parado, passo A, passo B) x 4 linhas (baixo, esquerda, direita, cima) ----------
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

function buildMage() {
  const dirs = ['down', 'left', 'right', 'up'];
  const img = image(3 * T, dirs.length * T);
  dirs.forEach((dir, row) => [0, 1, 2].forEach((f) => drawMage(img, f * T, row * T, dir, f)));
  return img;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'tileset.png'), encodePng(buildTileset()));
writeFileSync(join(OUT, 'mage.png'), encodePng(buildMage()));
console.log(`Placeholders gerados em ${OUT}: tileset.png, mage.png`);
