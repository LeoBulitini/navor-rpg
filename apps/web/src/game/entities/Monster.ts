import * as Phaser from 'phaser';
import { monsterIntent, type CreatureDef, type GridPoint, type MonsterIntent } from '@navor/shared';
import { TextureKeys } from '../../assets/index.ts';
import { content } from '../../content.ts';

export const creatureAnimKey = (sprite: string, state: 'idle' | 'walk') => `creature-${sprite}-${state}`;

/** Transparência de um bicho escondido (Aranha Gigante) enquanto não percebeu o jogador. */
const HIDDEN_ALPHA = 0.2;

/**
 * Um monstro ou animal de uma área gerada. A IA (monsterIntent) decide; aqui só se move e anima.
 * O dano que ele causa e recebe é calculado na cena; a recompensa do abate vem do servidor.
 * Bichos decorativos (Esquilo) usam a mesma classe, com `index` -1: fogem, mas não são alvo.
 */
export class Monster extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  hp: number;
  state: 'alive' | 'dying' | 'dead' = 'alive';
  intent: MonsterIntent = 'idle';
  private lastAttack = -Infinity;
  private readonly speed: number;
  private readonly home: { x: number; y: number };

  constructor(
    scene: Phaser.Scene,
    readonly index: number,
    readonly def: CreatureDef,
    cell: GridPoint,
  ) {
    const T = content.balance.tileSize;
    super(scene, cell.x * T + T / 2, cell.y * T + T / 2, TextureKeys.creature(def.sprite), 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.hp = def.stats.hp;
    this.speed = def.moveSpeedTilesPerSecond * T;
    this.home = { x: this.x, y: this.y };
    // Corpo pequeno nos pés, como o do jogador.
    this.body.setSize(16, 10);
    this.body.setOffset(8, 18);
    this.setCollideWorldBounds(true);
    // Chefes são maiores (o corpo acompanha a escala).
    if (def.scale !== 1) this.setScale(def.scale);
    this.play(creatureAnimKey(def.sprite, 'idle'));
    if (def.hidden) this.setAlpha(HIDDEN_ALPHA);
  }

  /**
   * Um passo da IA. Devolve true quando o monstro desfere um golpe neste quadro.
   * `stealth` (0 a 1, Furtividade): o monstro só nota o jogador mais de perto, até começar a persegui-lo.
   */
  think(now: number, player: { x: number; y: number } | null, stealth = 0): boolean {
    if (this.state !== 'alive') return false;
    const T = content.balance.tileSize;
    const c = this.body.center;
    const tiles = (p: { x: number; y: number }) => ({ x: p.x / T, y: p.y / T });
    const engaged = this.intent === 'chase' || this.intent === 'attack';
    if (player && stealth > 0 && !engaged && this.def.behavior !== 'flee') {
      const d = Math.hypot(player.x - c.x, player.y - c.y) / T;
      if (d > Math.max(this.def.attackRangeTiles, this.def.detectTiles * (1 - stealth))) player = null;
    }
    this.intent = monsterIntent(this.def, tiles(c), tiles(this.home), player && tiles(player), this.intent === 'chase' || this.intent === 'attack');
    let target: { x: number; y: number } | null = null;
    if (this.intent === 'chase') target = player;
    if (this.intent === 'return') target = this.home;
    // fugir: correr para o ponto oposto ao jogador
    if (this.intent === 'flee' && player) target = { x: 2 * c.x - player.x, y: 2 * c.y - player.y };
    if (this.def.hidden) this.setAlpha(this.intent === 'chase' || this.intent === 'attack' ? 1 : HIDDEN_ALPHA);
    if (target) {
      const angle = Phaser.Math.Angle.Between(c.x, c.y, target.x, target.y);
      this.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
      this.setFlipX(target.x < c.x);
    } else {
      this.setVelocity(0, 0);
    }
    if (player && this.intent === 'attack') this.setFlipX(player.x < c.x);
    this.play(creatureAnimKey(this.def.sprite, target ? 'walk' : 'idle'), true);
    this.setDepth(this.body.bottom);
    if (this.intent !== 'attack' || now - this.lastAttack < this.def.attackCooldownMs) return false;
    this.lastAttack = now;
    return true;
  }

  /** Piscar em branco ao levar dano. */
  flash(): void {
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(80, () => this.state === 'alive' && this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
  }
}
