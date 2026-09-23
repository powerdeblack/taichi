# Axie Duel

Protótipo de duelo em tabuleiro 3D pro Axie Vibeathon (Sky Mavis / Axie
Infinity), ambientado num **Salão Lunacia** (chão de pedra, colunas e um
emblema lunar brilhante no centro, estilo arena 3x3 de WoW): esquadrão
livre de 3 Axies, cada um com um **loadout de 5 cartas** que você monta
(ataque/defesa/cura, na proporção que quiser) — é essa composição, não um
papel fixo, que determina o quão forte, tanque ou curador cada Axie fica.
A **espécie** de um Axie (Beast/Aqua/Plant/Bird/Bug/Reptile) e sua
**função em combate** são desacopladas: qualquer espécie pode equipar
qualquer **conjunto de cartas** (Guerreiro/Sacerdote/Mago/Arqueiro/Ladino/
Xamã) — é o conjunto, não a espécie, que decide as cartas de ataque/
defesa/cura reais daquele Axie. Cada espécie tem um conjunto "nativo"
(Bird↔Arqueiro, Beast↔Guerreiro...) que desbloqueia uma carta-assinatura
bônus quando combinados, recompensando a combinação natural sem travar as
outras. Os dois esquadrões **entram andando** no salão a partir de uma
certa distância quando o duelo começa. O duelo é **em tempo real, sem
turnos**: os dois lados regeneram energia continuamente e podem jogar
cartas a qualquer momento; a mira é **tocar no alvo, depois na carta** —
qualquer Axie no tabuleiro, seu ou do rival (inclusive tocando direto na
barra de vida dele), inclusive pra reverter cartas de defesa/cura no
inimigo. O Tanque provoca (taunt) por perto e pode ser movido livremente
com um joystick, com o resto do esquadrão escoltando ele em formação.
Cada carta jogada aparece na tela com seu próprio ícone/nome, e os
efeitos de dano/cura ficam visíveis por mais tempo pra facilitar
acompanhar o jogo. Tudo baseado no core do Axie Origin (energia, classes,
status effects). Vence quem matar o Tanque do adversário primeiro. No
team picker, cada
Axie aparece como um modelo 3D real (Axie Mixer 3D oficial), não
placeholder.

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

- Você escolhe **3 Axies livremente** entre as 6 classes (pode repetir
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
- **Espécie vs. conjunto de cartas (desacoplados)**: a espécie de um Axie
  (Beast/Aqua/Plant/Bird/Bug/Reptile) só define visual (modelo 3D real) e o
  **triângulo de classe** pro cálculo de dano (Beast > Plant > Aqua > Beast,
  Bird > Bug > Reptile > Bird) — nada mais. Quem decide as cartas de
  ataque/defesa/cura que aquele Axie realmente joga é o **conjunto**
  escolhido no montador (Guerreiro/Sacerdote/Mago/Arqueiro/Ladino/Xamã, ver
  seção abaixo) — qualquer espécie pode equipar qualquer conjunto. Cada
  conjunto tem uma espécie **nativa** (ex.: Arqueiro↔Bird, Guerreiro↔Beast);
  combinar as duas desbloqueia uma **carta-assinatura** bônus (geralmente
  de ataque, mas Sacerdote↔Plant ganha uma 2ª carta de cura) — o
  off-species continua 100% jogável, só com o pool base, menor.
- **Tempo real, sem turnos**: `energyYou`/`energyRival` regeneram
  continuamente (~0.6/s cada), e qualquer carta afordável pode ser jogada a
  qualquer momento, dos dois lados — não existe handoff "sua vez/vez do
  rival". O rival age sozinho, em intervalos aleatórios (~1.5-2.5s), via
  `ai.js`'s `aiMaybeAct`. Bleed/Poison tickam num timer fixo (a cada 2s)
  compartilhado pelos dois lados, não mais "no início do seu turno".
- **Mira: toca no alvo, depois na carta**: diferente do modelo antigo
  (carta primeiro), agora você toca em **qualquer Axie no tabuleiro**
  (seu ou do rival) pra selecioná-lo — vira um anel branco pulsante
  (`.unit-chip.selected-target`), independente de qual carta você vai
  usar. Toca de novo no mesmo Axie pra desselecionar. Só então você toca
  numa carta da mão: cartas de **Ataque** só resolvem se o alvo
  selecionado for um inimigo dentro do alcance daquela carta. Curto
  alcance agora é um **raio de contato real** (`SHORT_RANGE_RADIUS`,
  distância entre as posições `localPos` ao vivo dos dois lados, não mais
  "mesma coluna") — se ninguém inimigo estiver fisicamente perto o
  suficiente agora, a carta simplesmente não tem alvo, sem cair pra
  "qualquer um" como no sistema antigo; longo alcance continua acertando
  qualquer inimigo vivo, não importa a distância. Como o Tanque (e agora
  também o rival, ver abaixo) andam de verdade pelo salão, esse raio muda
  a cada momento — sai da carta o hint explica por quê (fora de alcance,
  ou "Provocado" se o Tanque inimigo estiver puxando). Cartas de
  **Defesa/Cura** aceitam qualquer alvo vivo dos dois lados: aliado =
  efeito normal, inimigo = **revertido** (Cura Reversa, igual ao Origin)
  — Guarda/Bulwark/Barreira/Evasão/Espinhos viram **Vulnerável**, Cura/
  Regeneração viram **dano/DOT**. O clique é sempre ativo em cada unit
  chip (não é mais um modo que abre/fecha por carta) — ver `ui.js`'s
  `buildBoard(state, onUnitClick)`. O rival ainda mira automático (curto
  = dentro do mesmo raio de contato, longo = o mais fraco).
- **Movimento discreto**: dá pra trocar a coluna de um dos seus próprios
  Axies com outra (toca "Mover", toca o Axie, toca o destino) — sem turno
  pra esperar, só um cooldown curto (4s) depois de usar. Tira um Axie do
  raio de contato de um atacante inimigo, ou reposiciona pra entrar no
  alcance do seu próprio curto alcance num alvo específico.
- **Joystick do Tanque + escolta (posição livre, em tempo real) — dos dois
  lados**: ao lado do botão de mover, um joystick **só do Tanque** —
  **segura e arrasta** pra ele andar continuamente na direção empurrada
  (sem cooldown, sem encaixar em slot fixo), até um raio máximo ao redor
  do centro da formação. Os outros 2 Axies **escoltam**: seguem
  automaticamente, mantendo seu deslocamento de formação relativo à
  posição atual do Tanque (`moveSquadWithTank`), então o esquadrão
  inteiro avança/recua junto. Solta e todo mundo para onde estiver. "Pra
  cima" no joystick = rumo ao inimigo (mais perto do raio de Provocação
  do Tanque inimigo); "pra baixo" = recuar pra linha de trás. O **rival
  também anda sozinho**, num timer que alterna entre vagar numa direção
  aleatória por 1-3s e ficar parado por um instante (`main.js`'s
  `pickAiWanderMove`/`aiMoveTimer`) — chama a mesma `moveSquadWithTank`
  do joystick do jogador, só que sem pointer events. Isso é independente
  do `col` (slot fixo, usado pro alcance curto/longo e pro swap discreto)
  -- o roam livre só mexe na posição `localPos`.
- **Formação e Provocação (Taunt)**: cada lado forma um triângulo curto —
  o Tanque nasce no **centro** (com um anel dourado pulsante marcando seu
  raio de Provocação, `buildTauntRings`), e os outros 2 Axies flanqueiam
  ele, um de cada lado, fixos nesses slots (só mudam via o botão
  "Mover"). Não tem mais tile quadrado/losango debaixo de cada Axie como
  na v1 — o chão de pedra do próprio Salão Lunacia já dá a base visual, e
  os tiles individuais só poluíam a visão por cima dele. Quem ataca de
  perto do Tanque inimigo — agora medido por **distância real** até a
  posição atual dele, já que ele anda livre — é **obrigado** a mirar
  nele, não importa o alcance da carta, igual à carta real "Provocar" do
  Origin. Longe do raio, mira livre. Isso faz o joystick do Tanque ser
  genuinamente tático: correr pra frente pra proteger a retaguarda
  puxando os golpes pra si, ou recuar pra fugir da provocação e liberar
  os aliados pra mirar em qualquer um.
- **Salão Lunacia**: o tabuleiro é um salão circular grande (raio 11,
  chão de pedra, 12 colunas de ~4.8 de altura num anel bem mais perto do
  centro que a borda do salão — pra ficarem legíveis como pilares
  individuais em vez de se misturar com o aro distante — `board3d.js`'s
  `buildHall`) com um **emblema lunar brilhante** (`buildLunaciaSigilTexture`,
  desenhado via canvas em runtime — não é um asset importado) no centro,
  entre as duas fileiras, e névoa (`scene.fog`) escurecendo a distância
  pra reforçar a sensação de um salão vasto. A câmera foi recuada/alargada
  (FOV 28→34, mais longe) pra esse tamanho maior realmente aparecer, não só
  o chão. Ao começar o duelo, os dois esquadrões nascem afastados (atrás
  da própria formação) e **caminham** até a posição real (`introWalk`,
  reaproveitando o sistema de lerp que já existia pro swap discreto, só
  que mais lento) — a etiqueta de nome/vida de cada Axie só aparece
  (fade-in) depois que essa entrada termina, pra não ficar destacada numa
  posição que o modelo 3D ainda não alcançou.
- **Feedback de jogada**: todo acerto ou cura estoura um efeito de
  impacto **em 3D de verdade** na posição do alvo (`board3d.js`'s
  `spawnImpact`: um anel que se expande e faíscas que saltam e caem,
  cor laranja no dano e verde na cura), não só o flash/texto de DOM de
  antes — que ainda existem, e também duram bem mais (~1.7s o texto
  flutuante, ~0.65-0.75s os flashes) do que a v1 (~0.4-0.9s), já que as
  ativações estavam rápidas demais pra acompanhar. (Um popup de
  ícone+nome da carta foi tentado aqui e removido de novo — atrapalhava
  a visão do tabuleiro.)
- Status effects em cartas de Ataque: Bleed, **Poison** (empilha, bate 2x a
  stack atual e decai 1 stack por tick — mais forte no início, some
  sozinho), Deathmark, Retain, Ambush (2x dano no 1º acerto) e o combo de
  flechas. Toda carta de Defesa/Cura, de qualquer conjunto, tem uma
  mecânica nomeada própria — normal num aliado, **revertida** num inimigo
  (ver mira de Defesa/Cura acima). No inimigo, **toda** carta de Defesa vira
  **Vulnerável** (independente da mecânica normal), e toda carta de Cura
  vira dano/DOT equivalente (Cura Reversa):
  - **Guarda** (Sacerdote): bloqueia 50% do próximo golpe.
  - **Bastião** (Guerreiro): reduz os próximos 3 golpes recebidos em 25%
    cada, sem limpar status (mais golpes que o Limpeza+Bastião antigo, sem
    a limpeza).
  - **Barreira** (Mago): absorve os próximos N de dano recebido de uma vez
    só, não importa quantos golpes até acabar — diferente de reduzir um
    número fixo de hits.
  - **Evasão** (Arqueiro/Ladino): chance de esquivar **totalmente** do
    próximo golpe (Arqueiro: 50% de chance, 2 cargas; Ladino: 100%
    garantido, 1 carga) — dano zero, não reduzido, e nenhum outro status
    (shield/bulwark/deathmark) é consumido nessa esquiva.
  - **Espinhos** (Xamã): reflete 40% do dano dos próximos 2 golpes de volta
    em quem bateu — pode até matar o atacante.
  - **Cura instantânea** (a maioria dos conjuntos): cura na hora, escalado
    pelo MP do conjurador.
  - **Regeneração** (Ladino/Xamã/Sacerdote-nativo): cura um pouco a cada
    tick (2 a 4 ticks dependendo da carta) em vez de um valor único maior;
    revertida vira dano ao longo do tempo em vez de instantâneo.
- Cada Axie pode ser marcado como **Evoluído (+)** no montador de esquadrão:
  dá +15% flat em poder/HP/MP daquele loadout inteiro — nossa versão do
  padrão de evolução de carta do Origin (α → base → **+**), sem reintroduzir
  o sistema de breeding (a Sky Mavis já resolve isso).

### Os 6 conjuntos de cartas (classes funcionais)

Diferente da v1 (cartas de ataque presas à espécie), os conjuntos são
arquétipos **originais**, não portados 1:1 do Origin — mas seguem a mesma
convenção visual: a **cor de um conjunto é a cor da sua espécie nativa**
(igual no Origin, onde a cor da carta é a cor da classe), então no
montador um ícone de conjunto cuja cor bate com a cor do Axie é a
combinação nativa (⭐, cartas-assinatura bônus); cor diferente = combinação
livre, sem bônus.

| Conjunto | Espécie nativa | Identidade |
|---|---|---|
| ⚔️ Guerreiro | Beast | dano bruto corpo-a-corpo, Bastião |
| 🙏 Sacerdote | Plant | maior cura instantânea, Retain/Deathmark |
| 🔮 Mago | Aqua | nuke + status, Barreira (absorção) |
| 🏹 Arqueiro | Bird | chuva de flechas (combo), Evasão probabilística |
| 🗡️ Ladino | Bug | Veneno, Evasão garantida, Regeneração rápida |
| 🪶 Xamã | Reptile | Espinhos (reflete dano), a Regeneração mais longa |

Cada conjunto tem exatamente 4 cartas base (2 ataque + 1 defesa + 1 cura) e
uma **carta-assinatura** extra que só entra no pool quando a espécie do
Axie bate com a nativa do conjunto — normalmente uma 3ª carta de ataque
(ex.: Arqueiro+Bird ganha uma 2ª chuva de flechas), exceto Sacerdote+Plant,
que ganha uma 2ª carta de **cura** (Regeneração) em vez de ataque. Os
**números** (dano, HP, custo) são calibrados pra escala própria deste jogo
(~100-150 HP), não pra escala do Origin.

### Próximos passos

Ainda não implementado:

- **Rotação sazonal de meta**: uma "temporada" que buffa/vaulta conjuntos
  periodicamente, trazendo o mesmo tipo de movimento de meta que motiva o
  mercado de Axies real — sem mexer no sistema de conjuntos em si, só numa
  camada de multiplicadores temporários por cima.

## Estrutura

- `index.html` — telas de montagem de esquadrão e tabuleiro, mais o modal
  "❓ How to Play" (`#helpModal`, acessível nas duas telas) explicando
  montagem de time, mira e Tanque/movimento em 3 seções curtas
- `src/cards.js` — roster de 6 espécies (`AXIES`, só visual + triângulo) e
  6 conjuntos de cartas (`CARD_SETS`, a função real: 2 ataque + 1 defesa +
  1 cura cada, mais `signatureCard`/`signatureHealCard`/
  `signatureDefenseCard` que só entram no pool se `classId === set.
  nativeClassId`), `buildLoadout(setId, classId, counts)` monta o pool real
  de uma Axie, fórmula de stats por contagem de cartas (`computeLaneStats`)
- `src/game.js` — estado do duelo (**tempo real, sem `turn`**): N linhas
  por lado, cada uma com um `col` (slot fixo: 0 é o centro/Tanque, 1-2
  flanqueiam ele, dita alcance curto e o swap discreto) e um `localPos`
  ({x,z} ao vivo; o Tanque anda livre nele via `moveSquadWithTank`/
  `ROAM_RADIUS`, e essa mesma função reposiciona os outros 2 relativo à
  posição atual dele, formação de escolta), dano, cura, status effects
  (inclui `applyBarrier`/`applyDodge`/`applyThorns` além dos antigos
  Bulwark/Vulnerable/Regen), mira manual + Provocação por distância real
  (`getLegalTargets`/`TAUNT_RADIUS`/`pickAutoTarget`), mira de defesa/cura
  nos dois lados (`getSupportTargets`), movimento discreto com cooldown
  (`moveLane`/`MOVE_COOLDOWN_SEC`), regen de energia e tick de status
  contínuos (`tickEnergyRealtime`/`tickStatusTimer`), `resolveCard` recebe
  `targetSide` e despacha por `card.effect` (shield/bulwark/
  bulwark_cleanse/barrier/dodge/thorns/regen) normal-vs-revertido,
  condição de vitória (Tanque)
- `src/ai.js` — `aiMaybeAct`: chamado periodicamente pelo loop de
  `main.js` (não mais "turno do rival") — tenta jogar 1 carta afordável,
  mira automática via `pickAutoTarget`; não move lanes
- `src/render.js` — feedback visual via DOM: números flutuantes, flash de
  acerto/cura, shake do tabuleiro (durações alongadas de propósito, ver
  seção acima); o burst de impacto em 3D é `board3d.js`'s `spawnImpact`,
  chamado via `ui.spawnImpact`
- `src/ui.js` — HUD/DOM (montagem de esquadrão com steppers de loadout +
  seletor de conjunto por Axie (`renderSquad`), overlay de HP/nome/status
  sobre o tabuleiro 3D, clique persistente em qualquer unit chip pro fluxo
  de mira tocar-alvo-depois-carta (`buildBoard(state, onUnitClick)` +
  `markSelectedTarget`), destaque de movimento clicável pro swap discreto
  (`setSelectable`, agora só usado por esse fluxo), posicionamento ao vivo
  de qualquer lane durante o joystick (`setLiveLanePosition`/
  `endLiveLanePosition`), mão com reconciliação por `card.uid` (evita
  recriar o DOM a cada tick, que fazia cliques reais falharem), energia,
  banner)
- `src/axieArt.js` — arte SVG original por classe, usada só no team picker
  (roster/esquadrão) como fallback quando o 3D não carrega
- `src/axie3d.js` — preview 3D real (Axie Mixer 3D) no team picker (1 Axie
  por vez)
- `src/board3d.js` — o tabuleiro de duelo em si: uma cena three.js
  **compartilhada** (1 renderer/câmera só) com até 6 Axies 3D reais (3 de
  cada lado). O **Salão Lunacia** (`buildHall`) é o piso circular de
  pedra (raio 11) + anel de 12 colunas de ~4.8 de altura + o emblema lunar
  central desenhado via canvas em runtime (`buildLunaciaSigilTexture`) +
  névoa de distância (`scene.fog`) -- os antigos tiles em losango por
  baixo de cada Axie foram removidos (poluíam a visão por cima do chão do
  salão), sobrando só `buildTauntRings`: um anel pulsante no slot do
  Tanque marcando seu raio de Provocação. `spawnImpact` estoura um efeito
  em 3D na posição de um lane conforme o que aconteceu -- anel + faíscas
  laranja num acerto, verdes brilhantes subindo numa cura, azul num
  glint calmo de defesa ativada, bolhas roxas num tick de veneno, gotas
  vermelhas caindo num tick de sangramento (`IMPACT_STYLES`, uma entrada
  por "sabor" de efeito). No início da partida cada Axie nasce afastado da sua
  posição real e **caminha** até ela (`syncBoardAxies`'s `introWalk`,
  lerp mais lento que o normal + `setLocomotion('walk')` até chegar).
  Fora disso, cada Axie balança sutilmente perto da sua posição quando
  ocioso ("patrulha"), desliza suavemente pra novo slot no movimento
  discreto (`moveLaneVisual`, com lerp), e o Tanque é posicionado
  diretamente frame a frame enquanto o joystick é segurado
  (`setLaneLivePosition`/`setLaneRoaming`, sem lerp/patrulha nesse
  momento). HP/nome/status ficam em HTML posicionado por cima via
  projeção de câmera (`projectLane`) — não são modelos 3D
- `src/main.js` — entrada: wiring de DOM (incluindo o modal de ajuda) e o
  **loop de tempo real** (`requestAnimationFrame`) que regenera energia,
  tica status effects, chama a IA de cartas e o vagar autônomo do rival
  (`pickAiWanderMove`) periodicamente, e atualiza a UI — nada de handoff
  de turno

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
mais pesado: até 6 Axies simultâneos (3 de cada lado), todos numa única
cena/câmera/renderer three.js compartilhada — cada `mixer.create()` só
adiciona mais um modelo à mesma cena, então não abre vários contextos WebGL
(pesado pro celular). HP/nome/status ficam em `<div>`s absolutamente
posicionados por cima, calculados projetando a posição 3D de cada Axie pela
câmera (`projectLane`) — a mesma técnica que jogos como Apeiron usam pra UI
flutuante sobre um campo de batalha 3D. Pegadinha: `camera.matrixWorldInverse`
(usada por `Vector3.project`) só é recalculada durante um `render()`, então
`initBoard3D` chama `camera.updateMatrixWorld(true)` na configuração —
sem isso, a primeira leitura de posição (antes do primeiro frame) vem toda
errada.

## Próximos passos

- Reduzir o tamanho do bundle JS (o toolkit 3D é o grosso dele) com
  code-splitting/import dinâmico.

## Avisos

Não reempacotar os assets do Axie Mixer 3D (nem o subconjunto em
`public/assets/axie3d/`) como download standalone fora deste jogo — ver
`RIGHTS.md`/`THIRD_PARTY_NOTICES.md`.
