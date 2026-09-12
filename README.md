# Axie Duel

Protótipo de duelo 1v1 pro Axie Vibeathon (Sky Mavis / Axie Infinity): mira física
estilo estilingue (arco com gravidade) + sistema de cartas baseado no core do Axie
Origin (energia, classes, status effects).

## Rodando localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## Build de produção

```bash
npm run build
npm run preview
```

## Estrutura

- `index.html` — telas de deck builder e duelo
- `src/cards.js` — pool de 12 cartas, triângulo de classes, shuffle
- `src/physics.js` — trajetória de projétil, gravidade, colisão
- `src/game.js` — estado do duelo, energia, dano, status effects (Bleed,
  Deathmark, Retain, Shield), Ambush, combo
- `src/ai.js` — turno do rival
- `src/render.js` — desenho no canvas (Axies, projéteis, partículas, screen shake)
- `src/ui.js` — HUD/DOM (mão, energia, HP, status, banner de fim de jogo)
- `src/main.js` — entrada: wiring de DOM, input de arrastar/mirar, loop principal

`axie-duel-prototype.html` na raiz é o protótipo original em HTML/JS puro, mantido
como referência.

## Próximos passos

- Integrar o [Axie Mixer 3D](https://github.com/jaatster/threejs-axie-mixer-3d-public)
  via Three.js pra substituir os placeholders de canvas por Axies 3D configuráveis.
- Deploy (Vercel ou GitHub Pages) pra link jogável da submissão.

## Avisos

Não reempacotar assets do Axie Origins Battle Kit ou dos pacotes 3D oficiais como
download standalone — seguir `RIGHTS.md`/`THIRD_PARTY_NOTICES.md` desses projetos
se/quando forem incorporados.
