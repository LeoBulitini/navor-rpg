// Importa a arte dos personagens da pasta do artista para o jogo, sem dependências externas.
// Estrutura esperada (a de Downloads/Navor RPG/Assets/Personagens):
//   <pasta>/<qualquer subpasta>/<Nome da classe>/<direção>.png
// O nome da classe é o "name" de content/classes.json (Mago, Feiticeiro...), e as direções são
// south, south-west, west, north-west, north, north-east, east, south-east.
// Cada PNG é uma tira horizontal de quadros de 32x32 (hoje 1 quadro: parado).
// Saída: apps/web/public/assets/characters/<classId>/<direção>.png e a lista
// apps/web/src/assets/characters.json, que diz ao jogo quais classes já têm arte.
// Uso: npm run sprites:import -- "C:\Users\...\Assets\Personagens"
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'apps/web/public/assets/characters');
const LIST = join(ROOT, 'apps/web/src/assets/characters.json');
const FACINGS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
const FRAME = 32;

const src = process.argv[2];
if (!src) {
  console.error('Informe a pasta: npm run sprites:import -- "<pasta Personagens>"');
  process.exit(1);
}

// Nomes de pasta podem vir em NFD (macOS) ou com outra caixa; compara normalizado.
const norm = (s) => s.normalize('NFC').trim().toLowerCase();
const isDir = (p) => statSync(p).isDirectory();

const { paths } = JSON.parse(readFileSync(join(ROOT, 'content/classes.json'), 'utf8'));
const classes = paths.flatMap((p) => p.stages.map((s) => ({ id: s.classId, name: s.name })));

// Todas as pastas de classe: <pasta>/<grupo>/<classe>
const found = new Map();
for (const group of readdirSync(src)) {
  const g = join(src, group);
  if (!isDir(g)) continue;
  for (const name of readdirSync(g)) if (isDir(join(g, name))) found.set(norm(name), join(g, name));
}

function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR')
    throw new Error(`${file} não é um PNG válido`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// Recomeça do zero para não sobrar arte de uma importação anterior fora da lista.
rmSync(OUT, { recursive: true, force: true });
const imported = [];
const problems = [];
for (const c of classes) {
  const dir = found.get(norm(c.name));
  if (!dir) {
    problems.push(`${c.name} (${c.id}): pasta não encontrada`);
    continue;
  }
  const files = FACINGS.map((f) => ({ facing: f, file: join(dir, `${f}.png`) }));
  const missing = files.filter((f) => !statSafe(f.file)).map((f) => f.facing);
  if (missing.length) {
    problems.push(`${c.name} (${c.id}): faltam ${missing.join(', ')}`);
    continue;
  }
  const bad = files
    .map((f) => ({ ...f, ...pngSize(f.file) }))
    .filter((f) => f.h !== FRAME || f.w % FRAME !== 0 || f.w === 0);
  if (bad.length) {
    problems.push(`${c.name} (${c.id}): tamanho inválido em ${bad.map((f) => `${f.facing} ${f.w}x${f.h}`).join(', ')} (esperado altura ${FRAME} e largura múltipla de ${FRAME})`);
    continue;
  }
  const out = join(OUT, c.id);
  mkdirSync(out, { recursive: true });
  for (const f of files) copyFileSync(f.file, join(out, `${f.facing}.png`));
  imported.push(c.id);
}

function statSafe(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

writeFileSync(
  LIST,
  JSON.stringify(
    { $comment: 'Gerado por npm run sprites:import. Classes sem arte usam o placeholder.', classIds: imported },
    null,
    2,
  ) + '\n',
);
console.log(`Importadas ${imported.length} classes: ${imported.join(', ') || '(nenhuma)'}`);
if (problems.length) console.log(`Sem arte (vão usar o placeholder):\n  ${problems.join('\n  ')}`);
