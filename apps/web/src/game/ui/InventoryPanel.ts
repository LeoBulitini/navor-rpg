import * as Phaser from 'phaser';
import { content } from '../../content.ts';
import { itemTexture } from '../../assets/index.ts';
import type { Inventory } from '../backend.ts';

const ROW_H = 34;
const ROWS_PER_COLUMN = 7;
const COLUMN_W = 230;

/** Tecla I: lista os itens do personagem com o ícone, o nome na cor da raridade e a quantidade. */
export class InventoryPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly onChange = () => this.root.visible && this.render();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly inventory: Inventory,
    private readonly saves: boolean,
  ) {
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(20000).setVisible(false);
    inventory.on('change', this.onChange);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => inventory.off('change', this.onChange));
  }

  isOpen(): boolean {
    return this.root.visible;
  }

  toggle(): void {
    this.root.setVisible(!this.root.visible);
    if (this.root.visible) this.render();
  }

  private render(): void {
    const { width, height } = this.scene.scale;
    const rarityOrder = new Map(content.rarities.rarities.map((r, i) => [r.id, i]));
    const rarityColor = new Map(content.rarities.rarities.map((r) => [r.id, r.color]));
    const defs = new Map(content.items.items.map((i) => [i.id, i]));
    const rows = this.inventory
      .entries()
      .map(([id, quantity]) => ({ id, quantity, def: defs.get(id) }))
      .sort((a, b) => (rarityOrder.get(a.def?.rarity ?? '') ?? 99) - (rarityOrder.get(b.def?.rarity ?? '') ?? 99) || (a.def?.name ?? a.id).localeCompare(b.def?.name ?? b.id));

    const columns = Math.max(1, Math.ceil(rows.length / ROWS_PER_COLUMN));
    const panelW = Math.min(width - 16, Math.max(260, columns * COLUMN_W + 16));
    const panelH = 46 + Math.max(1, Math.min(rows.length, ROWS_PER_COLUMN)) * ROW_H + 8;
    const x0 = Math.round((width - panelW) / 2);
    const y0 = Math.round((height - panelH) / 2);

    this.root.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.root.add(o);
      return o;
    };
    add(this.scene.add.rectangle(x0, y0, panelW, panelH, 0x0b0d12, 0.94).setOrigin(0, 0).setStrokeStyle(1, 0x6b7280));
    add(this.scene.add.text(x0 + 8, y0 + 6, 'Inventário', { fontSize: '14px', color: '#f3f4f6' }));
    add(this.scene.add.text(x0 + panelW - 8, y0 + 8, 'I: fechar', { fontSize: '10px', color: '#9ca3af' }).setOrigin(1, 0));
    if (!this.saves) add(this.scene.add.text(x0 + 8, y0 + 24, 'Modo offline: nada é salvo', { fontSize: '10px', color: '#fbbf24' }));
    if (rows.length === 0) {
      add(this.scene.add.text(x0 + 8, y0 + 54, 'Vazio. Colete recursos na Gruta.', { fontSize: '11px', color: '#9ca3af' }));
      return;
    }
    rows.forEach((row, i) => {
      const x = x0 + 8 + Math.floor(i / ROWS_PER_COLUMN) * COLUMN_W;
      const y = y0 + 42 + (i % ROWS_PER_COLUMN) * ROW_H;
      add(this.scene.add.image(x, y, itemTexture(row.id)).setOrigin(0, 0));
      const color = rarityColor.get(row.def?.rarity ?? '') ?? '#e5e7eb';
      add(
        this.scene.add
          .text(x + 38, y + 9, row.def?.name ?? row.id, { fontSize: '11px', color, stroke: readableStroke(color), strokeThickness: 2 })
          .setData('itemId', row.id),
      );
      add(this.scene.add.text(x + COLUMN_W - 16, y + 9, `×${row.quantity}`, { fontSize: '11px', color: '#e5e7eb' }).setOrigin(1, 0));
    });
  }
}

/** Contorno claro para cores escuras (raridade Sombrio é quase preta), escuro para as demais. */
function readableStroke(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luminance = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luminance < 60 ? '#d1d5db' : '#000000';
}
