// Valida content/ contra os schemas antes do build. Uso: npm run content:check
import { loadContent } from '../packages/shared/src/index.ts';
import { readRawContent } from '../packages/shared/node/fs-content.ts';

try {
  const content = loadContent(readRawContent());
  console.log(
    `content/ OK: ${content.rarities.rarities.length} raridades, ` +
      `${content.classes.paths.length} caminhos de classe, ${content.tiles.tiles.length} tiles, ` +
      `${content.objects.objects.length} objetos, ${content.items.items.length} itens, ${content.procedural.areas.length} área(s) procedural(is), ` +
      `${Object.keys(content.maps).length} mapa(s).`,
  );
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
