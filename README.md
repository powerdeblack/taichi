# Axie Duel

Protótipo de duelo em tabuleiro 3D pro Axie Vibeathon (Sky Mavis / Axie
Infinity): esquadrão livre de 5 Axies, cada um com um **loadout de 5
cartas** que você monta (ataque/defesa/cura, na proporção que quiser) — é
essa composição, não um papel fixo, que determina o quão forte, tanque ou
curador cada Axie fica. O duelo é **em tempo real, sem turnos**: os dois
lados regeneram energia continuamente e podem jogar cartas a qualquer
momento, com mira manual (você escolhe o alvo) e um Tanque que provoca
(taunt) e pode ser movido livremente com um joystick. Tudo baseado no core
do Axie Origin (energia, classes, status effects). Vence quem matar o
Tanque do adversário primeiro. No team picker, cada Axie aparece como um
modelo 3D real (Axie Mixer 3D oficial), não placeholder.

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
- **Tempo real, sem turnos**: `energyYou`/`energyRival` regeneram
  continuamente (~0.6/s cada), e qualquer carta afordável pode ser jogada a
  qualquer momento, dos dois lados — não existe handoff "sua vez/vez do
  rival". O rival age sozinho, em intervalos aleatórios (~1.5-2.5s), via
  `ai.js`'s `aiMaybeAct`. Bleed/Poison tickam num timer fixo (a cada 2s)
  compartilhado pelos dois lados, não mais "no início do seu turno".
- **Mira manual**: jogar uma carta de ataque não resolve sozinho — abre um
  modo de mira que destaca (com brilho pulsante) os inimigos legais pra
  aquele alcance, e você toca em qual quer acertar. Curto alcance só pode
  acertar quem estiver **na sua mesma coluna** no tabuleiro (cai pra
  "qualquer um vivo" se não houver ninguém lá); longo alcance pode acertar
  qualquer inimigo vivo. O rival ainda mira automático (curto = mesma
  coluna, longo = o mais fraco).
- **Movimento**: dá pra trocar a coluna de um dos seus próprios Axies com
  outra (toca "Mover", toca o Axie, toca o destino) — sem turno pra
  esperar, só um cooldown curto (4s) depois de usar. É a ferramenta tática
  pro sistema de mira acima — tira um Axie da coluna de um atacante de
  curto alcance inimigo, ou reposiciona pra alinhar seu próprio curto
  alcance num alvo específico.
- **Joystick do Tanque (posição livre, em tempo real)**: ao lado do botão
  de mover, um joystick dedicado só pro Tanque — **segura e arrasta** pra
  ele andar continuamente na direção empurrada (sem cooldown, sem
  encaixar em slot fixo), até um raio máximo ao redor do centro da
  formação. Solta e ele para onde estiver. "Pra cima" no joystick = rumo
  ao inimigo (linha de frente, mais perto do próprio raio de Provocação);
  "pra baixo" = recuar pra linha de trás.
- **Formação e Provocação (Taunt)**: cada lado forma um losango — o Tanque
  nasce no **centro** (tile dourado brilhante, com um anel de raio), e os
  outros 4 Axies ficam 2 na frente/2 atrás ao redor dele, fixos nesses
  slots (só mudam via o botão "Mover"). Quem ataca de perto do Tanque
  inimigo — agora medido por **distância real** até a posição atual dele,
  já que ele anda livre — é **obrigado** a mirar nele, não importa o
  alcance da carta, igual à carta real "Provocar" do Origin. Longe do
  raio, mira livre. Isso faz o joystick do Tanque ser genuinamente tático:
  correr pra frente pra proteger a retaguarda puxando os golpes pra si, ou
  recuar pra fugir da provocação e liberar os aliados pra mirar em
  qualquer um.
- Status effects: Bleed, **Poison** (empilha, bate 2x a stack atual e decai 1
  stack por tick — mais forte no início, some sozinho), Deathmark, Retain,
  Shield/Cleanse, Ambush (2x dano no 1º acerto) e o combo da Pena.
- Cada Axie pode ser marcado como **Evoluído (+)** no montador de esquadrão:
  dá +15% flat em poder/HP/MP daquele loadout inteiro — nossa versão do
  padrão de evolução de carta do Origin (α → base → **+**), sem reintroduzir
  o sistema de breeding (a Sky Mavis já resolve isso).

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
- `src/game.js` — estado do duelo (**tempo real, sem `turn`**): N linhas por
  lado, cada uma com um `col` (slot fixo: 0 é o centro/Tanque, 1-4 são
  frente/trás) e um `localPos` ({x,z} ao vivo — igual ao slot pra não-
  Tanque, livre e contínuo só pro Tanque via `moveTankFreely`), dano, cura,
  status effects, mira manual + Provocação por distância real
  (`getLegalTargets`/`TAUNT_RADIUS`/`pickAutoTarget`), movimento discreto
  com cooldown (`moveLane`/`MOVE_COOLDOWN_SEC`), regen de energia e tick de
  status contínuos (`tickEnergyRealtime`/`tickStatusTimer`), condição de
  vitória (Tanque)
- `src/ai.js` — `aiMaybeAct`: chamado periodicamente pelo loop de
  `main.js` (não mais "turno do rival") — tenta jogar 1 carta afordável,
  mira automática via `pickAutoTarget`; não move lanes
- `src/render.js` — feedback visual via DOM (números flutuantes, flash, shake)
- `src/ui.js` — HUD/DOM (montagem de esquadrão com steppers de loadout,
  overlay de HP/nome/status sobre o tabuleiro 3D, destaque de alvo/movimento
  clicável (`setSelectable`), posicionamento ao vivo do Tanque durante o
  joystick (`setLiveLanePosition`/`endLiveLanePosition`), mão, energia,
  banner)
- `src/axieArt.js` — arte SVG original por classe, usada só no team picker
  (roster/esquadrão) como fallback quando o 3D não carrega
- `src/axie3d.js` — preview 3D real (Axie Mixer 3D) no team picker (1 Axie
  por vez)
- `src/board3d.js` — o tabuleiro de duelo em si: uma cena three.js
  **compartilhada** (1 renderer/câmera só) com até 10 Axies 3D reais (5 de
  cada lado) sobre tiles em losango (laranja/azul, estilo Apeiron) numa
  **formação centrada no Tanque** (`FORMATION`: centro + frente/trás),
  com um tile maior e anel pulsante no slot do Tanque marcando o raio de
  Provocação. Cada Axie balança sutilmente perto da sua posição quando
  ocioso ("patrulha"), desliza suavemente pra novo slot no movimento
  discreto (`moveLaneVisual`, com lerp), e o Tanque é posicionado
  diretamente frame a frame enquanto o joystick é segurado
  (`setLaneLivePosition`/`setLaneRoaming`, sem lerp/patrulha nesse
  momento). HP/nome/status ficam em HTML posicionado por cima via projeção
  de câmera (`projectLane`) — não são modelos 3D
- `src/main.js` — entrada: wiring de DOM e o **loop de tempo real**
  (`requestAnimationFrame`) que regenera energia, tica status effects,
  chama a IA periodicamente e atualiza a UI — nada de handoff de turno

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
`public/assets/axie3d/`.

O tabuleiro de duelo (`src/board3d.js`) também usa o 3D real, mas de um jeito
mais pesado: até 10 Axies simultâneos (5 de cada lado), todos numa única
cena/câmera/renderer three.js compartilhada — cada `mixer.create()` só
adiciona mais um modelo à mesma cena, então não abre 10 contextos WebGL
(pesado pro celular). HP/nome/status ficam em `<div>`s absolutamente
posicionados por cima, calculados projetando a posição 3D de cada Axie pela
câmera (`projectLane`) — a mesma técnica que jogos como Apeiron usam pra UI
flutuante sobre um campo de batalha 3D. Pegadinha: `camera.matrixWorldInverse`
(usada por `Vector3.project`) só é recalculada durante um `render()`, então
`initBoard3D` chama `camera.updateMatrixWorld(true)` na configuração —
sem isso, a primeira leitura de posição (antes do primeiro frame) vem toda
errada.

## Próximos passos

- Levar o Axie 3D também pro tabuleiro de duelo (hoje só o team picker usa).
- Reduzir o tamanho do bundle JS (o toolkit 3D é o grosso dele) com
  code-splitting/import dinâmico.

## Avisos

Não reempacotar os assets do Axie Mixer 3D (nem o subconjunto em
`public/assets/axie3d/`) como download standalone fora deste jogo — ver
`RIGHTS.md`/`THIRD_PARTY_NOTICES.md`.
