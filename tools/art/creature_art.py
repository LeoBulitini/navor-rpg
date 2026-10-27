"""Sprites provisórios dos monstros e do Projétil Arcano, desenhados por código (pixel art).

Gera:
  apps/web/public/assets/creatures/<sprite>.png  tira 64x32: quadro 0 parado, quadro 1 andando.
                                                 Desenhado virado para a direita; o jogo espelha.
  apps/web/public/assets/effects/<sprite>.png    16x16 (o projétil do ataque básico)

É arte de trabalho: para trocar, substitua os PNGs pelos definitivos com o mesmo nome e tamanho.
Requer Python 3 e Pillow (pip install pillow). Uso: python3 tools/art/creature_art.py
"""
import json
import os

from city_art import P, ROOT, Img, hx
from item_art import blob, ground_shadow, outline

PUBLIC = os.path.join(ROOT, 'apps', 'web', 'public', 'assets')
OL = P['ol']


def rat(step):
    img = Img(32, 32)
    fur, dark, light = hx('#7a6a5c'), hx('#544638'), hx('#a39282')
    bob = 1 if step else 0
    # cauda
    for i, (x, y) in enumerate(((4, 20), (5, 21), (6, 21), (7, 21), (8, 20), (3, 19), (2, 18))):
        img.px(x, y + bob, hx('#c89a8a'))
    blob(img, 15, 20 + bob, 7, 4, fur, dark, light)
    blob(img, 22, 19 + bob, 4, 3, fur, dark, light)
    img.px(26, 19 + bob, hx('#c89a8a'))  # focinho
    img.px(27, 19 + bob, hx('#c89a8a'))
    img.px(23, 18 + bob, P['r1'])  # olho
    blob(img, 20, 15 + bob, 1, 1, hx('#c89a8a'))  # orelha
    for x in ((11, 18) if step else (12, 19)):
        img.rect(x, 24, 1, 2, dark)
    outline(img)
    ground_shadow(img, 16, 27, 8)
    return img


def goblin(step):
    img = Img(32, 32)
    skin, skin_d, skin_l = hx('#6aa84f'), hx('#3f7a2e'), hx('#94d07a')
    cloth, cloth_d = hx('#7a4a2a'), hx('#56331c')
    bob = 1 if step else 0
    # pernas
    for x, h in ((13, 5 - bob), (17, 4 + bob)) if step else ((13, 5), (17, 5)):
        img.rect(x, 22, 2, h, skin_d)
    # corpo (túnica)
    img.rect(11, 14 + bob, 10, 9, cloth)
    img.rect(11, 20 + bob, 10, 2, cloth_d)
    img.rect(11, 18 + bob, 10, 1, hx('#3a2a1a'))  # cinto
    # cabeça
    blob(img, 16, 9 + bob, 5, 4, skin, skin_d, skin_l)
    for x, y in ((9, 7), (10, 8), (22, 7), (21, 8)):  # orelhas pontudas
        img.px(x, y + bob, skin)
    img.px(18, 8 + bob, P['y'])
    img.px(19, 8 + bob, P['y'])
    img.px(17, 11 + bob, P['f1'])  # presa
    # braço com porrete
    img.rect(21, 15 + bob, 2, 5, skin)
    img.rect(23, 10 + bob, 2, 9, hx('#8a5a32'))
    img.rect(22, 9 + bob, 4, 3, hx('#6a4224'))
    outline(img)
    ground_shadow(img, 16, 28, 7)
    return img


def bolt():
    img = Img(16, 16)
    blob(img, 8, 8, 5, 5, hx('#7c3aed', 110))
    blob(img, 8, 8, 3, 3, hx('#a78bfa'))
    blob(img, 8, 8, 1, 1, hx('#f5f3ff'))
    return img


def arrow():
    img = Img(16, 16)
    for x in range(2, 12):
        img.px(x, 8, hx('#8a5a32'))
    for x, y in ((12, 8), (11, 7), (11, 9), (13, 8), (10, 6), (10, 10)):
        img.px(x, y, hx('#c8ccd4'))
    for x, y in ((2, 7), (3, 6), (2, 9), (3, 10), (1, 7), (1, 9)):
        img.px(x, y, hx('#e5e7eb'))
    return img


def slash():
    """Arco de golpe virado para a direita (o jogo gira conforme a direção)."""
    import math
    img = Img(32, 32)
    for i in range(-50, 51, 2):
        a = math.radians(i)
        for r, c in ((11, hx('#ffffff', 230)), (12, hx('#dbeafe', 200)), (13, hx('#93c5fd', 140))):
            img.px(round(10 + r * math.cos(a)), round(16 + r * math.sin(a)), c)
    return img


def strip(frames):
    out = Img(32 * len(frames), 32)
    for i, f in enumerate(frames):
        out.paste(f, 32 * i, 0)
    return out


CREATURES = {
    'cave-rat': lambda: strip([rat(0), rat(1)]),
    'goblin-raider': lambda: strip([goblin(0), goblin(1)]),
}
EFFECTS = {'arcane-bolt': bolt, 'arrow': arrow, 'slash': slash}


def main():
    with open(os.path.join(ROOT, 'content', 'creatures.json'), encoding='utf8') as f:
        wanted = {c['sprite'] for c in json.load(f)['creatures']}
    with open(os.path.join(ROOT, 'content', 'combat.json'), encoding='utf8') as f:
        effects = {a['sprite'] for a in json.load(f)['basicAttacks'].values()}
    for kind, have in (('monstros', wanted - CREATURES.keys()), ('efeitos', effects - EFFECTS.keys())):
        if have:
            raise SystemExit(f'Sem desenho para {kind}: {", ".join(sorted(have))}')
    for folder, table, names in (('creatures', CREATURES, wanted), ('effects', EFFECTS, effects)):
        os.makedirs(os.path.join(PUBLIC, folder), exist_ok=True)
        for name in sorted(names):
            table[name]().im.save(os.path.join(PUBLIC, folder, f'{name}.png'))
    print(f'{len(wanted)} monstros e {len(effects)} efeito(s) gerados em {PUBLIC}')


if __name__ == '__main__':
    main()
