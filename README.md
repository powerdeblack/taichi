# Axie Duel

Protótipo de duelo em tabuleiro pro Axie Vibeathon (Sky Mavis / Axie Infinity):
3 linhas por lado, cartas resolvem automaticamente (ataque curto/longo, defesa,
cura), tudo baseado no core do Axie Origin (energia, classes, status effects).
No team picker, cada Axie aparece como um modelo 3D real (Axie Mixer 3D
oficial), não placeholder.

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

## Deploy

- **GitHub Pages**: `.github/workflows/deploy.yml` builda e publica em todo
  push pra `main` ou pra esta branch. Só precisa habilitar uma vez em
  Settings → Pages → Source: **GitHub Actions**. Fica em
  `https://<usuário>.github.io/<repo>/`.
- **Vercel**: zero config — importar o repo no dashboard detecta Vite
  automaticamente.

`vite.config.js` usa `base: '/'` por padrão (Vercel/local) e só troca pra
`/<repo>/` quando a env var `GH_PAGES=true` está setada (feito pelo workflow).

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
- `src/axieArt.js` — arte SVG original por classe (fallback quando o 3D não
  carrega) + convenção pra imagem 2D real
- `src/axie3d.js` — preview 3D real (Axie Mixer 3D) no team picker
- `src/main.js` — entrada: wiring de DOM e o loop de turnos

`axie-duel-prototype.html` na raiz é o protótipo original (mira física de
estilingue), mantido como referência histórica — não é mais o jogo atual.

## Axies 3D reais (Axie Mixer 3D)

O team picker renderiza cada Axie como um modelo 3D real via
`@jaatster/threejs-axie-mixer3d-public` (toolkit oficial do Sky Mavis pro
Vibeathon), sem precisar de genes de carteira: `src/axie3d.js` monta um
`AxieDescriptor` explícito por classe (partes fixas, variant 2/skin 0/level 1)
e chama `mixer.create({ descriptor, ... })`.

O pacote de assets oficial tem ~512MB (5.821 arquivos, todas as
classes/variantes/níveis/armas). `public/assets/axie3d/` guarda só o
subconjunto que os 6 Axies do roster usam — corpo "normal", as 36 partes
(6 classes × olho/boca/orelha/chifre/costas/cauda) e as animações — uns
37MB. O `manifest.json` ali é uma cópia **inteira e sem alterações** do
oficial (o runtime valida a contagem exata de cada categoria e rejeita um
manifest cortado), só os arquivos físicos é que foram reduzidos.

Pra regenerar depois de atualizar o pacote:

```bash
npm install github:jaatster/threejs-axie-mixer3d-public three@0.178.0
node scripts/trim-axie3d-assets.mjs
```

`RIGHTS.md`/`THIRD_PARTY_NOTICES.md` do pacote oficial estão copiados em
`public/assets/axie3d/`. Por ora o 3D real só aparece no team picker — o
tabuleiro de duelo continua com a arte SVG 2D (`axieArt.js`) por
performance/simplicidade, com espaço pra imagem 2D real via
`public/assets/axies/README.md` se preferir esse caminho ali também.

## Próximos passos

- Levar o Axie 3D também pro tabuleiro de duelo (hoje só o team picker usa).
- Reduzir o tamanho do bundle JS (o toolkit 3D é o grosso dele) com
  code-splitting/import dinâmico.

## Avisos

Não reempacotar os assets do Axie Mixer 3D (nem o subconjunto em
`public/assets/axie3d/`) como download standalone fora deste jogo — ver
`RIGHTS.md`/`THIRD_PARTY_NOTICES.md`.
