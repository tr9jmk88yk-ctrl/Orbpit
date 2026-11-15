# ORB PIT

Roguelite de bolas a ressaltar em pixel art de 32 bits, inspirado na mecânica de combate do *Ball x Pit*
(sem a parte de construir a base e colher recursos). HTML5 puro, sem dependências, pensado para telemóvel.

## Jogar

- **Localmente:** abre `index.html` no browser (ou `python3 -m http.server` e vai a `localhost:8000`).
- **No telemóvel (GitHub Pages):** *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
  Abre o link no Safari/Chrome e, se quiseres, *Partilhar → Adicionar ao ecrã principal* para jogar em ecrã inteiro.

## Controlos

| | Toque | Teclado / rato |
|---|---|---|
| Mover | arrastar o dedo | `A`/`D` ou setas, ou arrastar com o rato |
| Mirar | automático (acerta nos inimigos mais baixos) | rato (modo MANUAL) |
| Pausa | botão no canto superior direito | `Esc` / `P` |
| Cartas | tocar na carta | tocar ou teclas `1` `2` `3` |

Em PAUSA podes alternar a mira entre **AUTO** e **MANUAL** e ligar/desligar o som.

## Como funciona

- As bolas disparam sozinhas em rajadas, ressaltam nas paredes e no teto e **regressam quando caem**. Só sai
  nova rajada quando todas voltam.
- Matar inimigos dá XP. Ao subir de nível escolhes **1 de 3 cartas**: nova bola, melhoria, **fusão** ou passiva.
- **Fusão:** duas bolas diferentes de nível 2+ juntam-se numa só (ex.: Fogo + Gelo = *Steam Orb*) e herdam os efeitos das duas.
- 6 níveis, cada um com ondas crescentes e um boss no fim. Estrelas por nível (3 = sem levar dano).
- Níveis mais altos começam com picks grátis, para não arrancares do zero.
- O progresso (níveis desbloqueados, estrelas, definições) fica em `localStorage`.

## Estrutura

```
index.html   página + canvas
style.css    layout e pixel-perfect scaling
game.js      todo o jogo (dados, sprites, lógica, UI, áudio)
docs/ANALISE.md   análise do Ball x Pit e decisões de design
```

## Ajustar o jogo

Quase tudo está no topo de `game.js`: `BT` (bolas), `FUS` (nomes das fusões), `PASSIVES`, `CH` (heróis),
`LV` (níveis), `ET` (inimigos). Os sprites são strings (`MAPS`), fáceis de editar.

Jogo original: *Ball x Pit*, de Kenny Sun / Devolver Digital. Este projeto é um clone de mecânicas, com arte, nomes e código próprios.
