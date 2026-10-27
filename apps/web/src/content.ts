// Ponto único de acesso aos dados de content/ no cliente. Valida tudo na inicialização.
import { loadContent, type Content } from '@navor/shared';
import rarities from '@content/rarities.json';
import classes from '@content/classes.json';
import tiles from '@content/tiles.json';
import balance from '@content/balance.prototype.json';
import objects from '@content/objects.json';
import items from '@content/items.json';
import creatures from '@content/creatures.json';
import progression from '@content/progression.json';
import combat from '@content/combat.json';
import world from '@content/world.json';
import procedural from '@content/procedural.json';
import shops from '@content/shops.json';
import equipment from '@content/equipment.json';
import recipes from '@content/recipes.json';
import skills from '@content/skills.json';
import quests from '@content/quests.json';

const mapFiles = import.meta.glob('@content/maps/*.json', { eager: true, import: 'default' });

export const content: Content = loadContent({
  rarities,
  classes,
  tiles,
  balance,
  objects,
  items,
  creatures,
  progression,
  combat,
  world,
  procedural,
  shops,
  equipment,
  recipes,
  skills,
  quests,
  maps: Object.fromEntries(Object.entries(mapFiles).map(([path, data]) => [path.split('/').pop()!, data])),
});
