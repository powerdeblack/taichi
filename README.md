# Axie Duel

Protótipo de duelo em tabuleiro pro Axie Vibeathon (Sky Mavis / Axie Infinity):
3 linhas por lado, cartas resolvem automaticamente (ataque curto/longo, defesa,
cura), tudo baseado no core do Axie Origin (energia, classes, status effects).

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

## Como o tabuleiro funciona

- Você escolhe 3 dos 6 Axies (um por classe) pro seu time; a ordem escolhida
  define a linha (1, 2, 3). O rival fica com os 3 restantes.
- Cada Axie tem 2 cartas próprias: um ataque de **curto alcance** (só acerta a
  linha espelhada) e um de **longo alcance** (mira a linha inimiga com menos
  HP) — exceto Plant (cura a própria linha) e Reptile (2 cartas de defesa).
- Energia por turno, triângulo de classes (Beast > Plant > Aqua > Beast, Bird
  > Bug > Reptile > Bird), status effects: Bleed, Deathmark, Retain,
  Shield/Cleanse, Ambush (2x dano no 1º acerto) e o combo da Pena.
- Clicar numa carta jogável resolve a ação na hora — sem mira manual.

## Estrutura

- `index.html` — telas de escolha de time e tabuleiro
- `src/cards.js` — roster de 6 Axies (2 cartas cada), triângulo de classes
- `src/game.js` — estado do duelo, 3 linhas por lado, dano, cura, status effects
- `src/ai.js` — turno do rival
- `src/render.js` — feedback visual via DOM (números flutuantes, flash, shake)
- `src/ui.js` — HUD/DOM (tabuleiro, mão, energia, status, banner)
- `src/axieArt.js` — arte SVG original por classe + fallback pra imagem real
- `src/main.js` — entrada: wiring de DOM e o loop de turnos

`axie-duel-prototype.html` na raiz é o protótipo original (mira física de
estilingue), mantido como referência histórica — não é mais o jogo atual.

## Imagens reais dos Axies

Por padrão o jogo usa arte SVG original (não é arte oficial da Axie). Pra
usar imagens reais, veja `public/assets/axies/README.md` — é só soltar os
arquivos lá com o nome certo (`beast.png`, `aqua.png`, etc.) que o jogo troca
sozinho.

## Próximos passos

- Trocar a arte placeholder pelas imagens reais dos Axies (repositório
  Axie Mixer 3D é privado/restrito a projetos aprovados — precisa de acesso).
- Deploy (Vercel ou GitHub Pages) pra link jogável da submissão.

## Avisos

Não reempacotar assets do Axie Origins Battle Kit ou dos pacotes 3D oficiais
como download standalone — seguir `RIGHTS.md`/`THIRD_PARTY_NOTICES.md` desses
projetos se/quando forem incorporados.
