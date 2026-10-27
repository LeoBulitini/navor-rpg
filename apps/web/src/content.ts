// Ponto único de acesso aos dados de content/ no cliente. Valida tudo na inicialização.
import { loadContent, type Content } from '@navor/shared';
import rarities from '@content/rarities.json';
import classes from '@content/classes.json';
import tiles from '@content/tiles.json';
import balance from '@content/balance.prototype.json';
import objects from '@content/objects.json';
import world from '@content/world.json';

const mapFiles = import.meta.glob('@content/maps/*.json', { eager: true, import: 'default' });

export const content: Content = loadContent({
  rarities,
  classes,
  tiles,
  balance,
  objects,
  world,
  maps: Object.fromEntries(Object.entries(mapFiles).map(([path, data]) => [path.split('/').pop()!, data])),
});
