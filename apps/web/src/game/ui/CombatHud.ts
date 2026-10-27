import * as Phaser from 'phaser';
import type { ProgressState } from '../backend.ts';

export interface Vitals {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
}

const BAR_W = 90;
const BAR_H = 6;
const DEPTH = 10000;
const BOSS_W = 200;
/** abaixo das dicas de teclas e da linha de nível e moedas */
const BOSS_Y = 62;

/** Barras de vida, mana e XP no canto superior esquerdo, com nível, cobre e ouro. */
export class CombatHud {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bossLabel: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
    this.bossLabel = scene.add
      .text(scene.scale.width / 2, BOSS_Y - 1, '', { fontSize: '10px', color: '#fde68a', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false);
    this.label = scene.add
      .text(4, 4 + 3 * (BAR_H + 3), '', { fontSize: '10px', color: '#e5e7eb', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } })
      .setScrollFactor(0)
      .setDepth(DEPTH);
  }

  /** `levelXp` = [XP total do nível atual, XP total do próximo] (iguais no nível máximo). */
  draw(v: Vitals, progress: ProgressState, levelXp: [number, number]): void {
    const [from, to] = levelXp;
    const xpFrac = to > from ? (progress.xp - from) / (to - from) : 1;
    this.g.clear();
    this.bar(0, v.hp / v.maxHp, 0xdc2626);
    this.bar(1, v.mana / v.maxMana, 0x3b82f6);
    this.bar(2, xpFrac, 0xeab308);
    this.label.setText(
      `Nv ${progress.level}   Vida ${Math.ceil(v.hp)}/${v.maxHp}   Mana ${Math.floor(v.mana)}/${v.maxMana}   Cobre ${progress.copper}   Ouro ${progress.gold}`,
    );
  }

  /** Barra de vida do chefe no topo da tela (Covil do Dragão); null esconde. */
  drawBoss(boss: { name: string; hp: number; maxHp: number } | null): void {
    this.bossLabel.setVisible(Boolean(boss));
    if (!boss) return;
    const w = BOSS_W;
    const x = Math.round(this.scene.scale.width / 2 - w / 2);
    this.bossLabel.setText(boss.name);
    this.g.fillStyle(0x000000, 0.75).fillRect(x - 1, BOSS_Y, w + 2, BAR_H + 2);
    this.g.fillStyle(0xb91c1c, 1).fillRect(x, BOSS_Y + 1, Math.round(w * Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1)), BAR_H);
  }

  private bar(row: number, frac: number, color: number): void {
    const y = 4 + row * (BAR_H + 3);
    this.g.fillStyle(0x000000, 0.7).fillRect(4, y, BAR_W + 2, BAR_H + 2);
    this.g.fillStyle(color, 1).fillRect(5, y + 1, Math.round(BAR_W * Phaser.Math.Clamp(frac, 0, 1)), BAR_H);
  }
}
