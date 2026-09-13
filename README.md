# Axie Duel

Protótipo de duelo em tabuleiro pro Axie Vibeathon (Sky Mavis / Axie Infinity):
esquadrão livre de 5 Axies, cada um com um **loadout de 5 cartas** que você
monta (ataque/defesa/cura, na proporção que quiser) — é essa composição, não
um papel fixo, que determina o quão forte, tanque ou curador cada Axie fica.
Cartas resolvem automaticamente, tudo baseado no core do Axie Origin (energia,
classes, status effects). Vence quem matar o Tanque do adversário primeiro. No
team picker, cada Axie aparece como um modelo 3D real (Axie Mixer 3D oficial),
não placeholder.

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

- Você escolhe **5 Axies livremente** entre as 6 classes (pode repetir
  classe). Pra cada um, distribui um **loadout de exatamente 5 cartas**
  entre Ataque / Defesa / Cura, na proporção que quiser (5/0/0, 2/2/1,
  0/0/5...). Marca **exatamente 1 Axie como Tanque** (só define o alvo da
  vitória, não muda status). O rival monta um time aleatório com a mesma
  regra. **Vencer = derrubar o Tanque inimigo** (as outras linhas não
  precisam morrer).
- A composição do loadout — não um papel fixo — é o que define os stats:
  - Cada carta de **Ataque** dá **+15% de poder de dano** daquele Axie.
  - Cada carta de **Defesa** dá **+10 HP máximo** e **-6% de dano recebido**
    (até um teto de 50% de redução).
  - Cada carta de **Cura** dá **+20 MP**, e o MP escala o quanto aquele Axie
    realmente cura/bloqueia com cartas de cura ou defesa — um Axie sem
    investimento em cura que usa uma carta de cura emprestada cura bem menos.
  - Ter 5 cartas de defesa não impede ter 1 carta de ataque misturada: cada
    carta continua individual e jogável, os bônus são só a soma dos tipos.
- Cartas de Ataque têm a identidade/triângulo de classe de cada Axie (Beast >
  Plant > Aqua > Beast, Bird > Bug > Reptile > Bird — ainda influencia o
  dano). Cartas de Defesa e Cura são **universais**: qualquer classe pode
  equipar.
- Cartas de **ataque não gastam energia** (custo 0); defesa/cura seguem
  custando energia normalmente, regenerando por turno.
- Status effects: Bleed, **Poison** (empilha, bate 2x a stack atual e decai 1
  stack por turno — mais forte no início, some sozinho), Deathmark, Retain,
  Shield/Cleanse, Ambush (2x dano no 1º acerto) e o combo da Pena.
- Cada Axie pode ser marcado como **Evoluído (+)** no montador de esquadrão:
  dá +15% flat em poder/HP/MP daquele loadout inteiro — nossa versão do
  padrão de evolução de carta do Origin (α → base → **+**), sem reintroduzir
  o sistema de breeding (a Sky Mavis já resolve isso).
- Clicar numa carta jogável resolve a ação na hora — sem mira manual.

### Cartas reskinadas com nomes reais do Axie Origin

Os nomes e o flavor das cartas de ataque e das cartas universais de
defesa/cura vêm de cartas reais do Axie Origin (Beast: Besta Perigosa /
Quebra-Nozes; Aqua: Koi / Ranchu; Plant: Cenoura / Melancia; Bird: Corvo /
Melodia das Penas; Bug: Broca de Nariz / Cupins; Reptile: Dinossaurinho /
Garra Venenosa; suporte universal: Ornitorrinco, Guardião Tropical,
Cachorrinho, Trevo). Os **números** (dano, HP, custo) são calibrados pra
escala própria deste jogo, não são um port 1:1 do Origin — lá as cartas são
calibradas pra pools de HP de centenas de pontos, aqui pra ~100-150.

## Estrutura

- `index.html` — telas de montagem de esquadrão e tabuleiro
- `src/cards.js` — roster de 6 Axies (2 cartas de ataque cada), cartas de
  defesa/cura universais, triângulo de classes, fórmula de stats por
  contagem de cartas (`computeLaneStats`)
- `src/game.js` — estado do duelo, N linhas por lado, dano, cura, status
  effects, condição de vitória (Tanque)
- `src/ai.js` — turno do rival
- `src/render.js` — feedback visual via DOM (números flutuantes, flash, shake)
- `src/ui.js` — HUD/DOM (montagem de esquadrão com steppers de loadout,
  tabuleiro, mão, energia, status, banner)
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
