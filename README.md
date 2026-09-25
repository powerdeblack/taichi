# Axie Duel

Protótipo de duelo em tabuleiro 3D pro Axie Vibeathon (Sky Mavis / Axie
Infinity), ambientado num **campo de neve Lunacia** (neve caindo, céu de
crepúsculo e o símbolo Lunacia grande e brilhante no chão): esquadrão
livre de 3 Axies, cada um com um **loadout de 5 cartas** que você monta
(ataque/defesa/cura, na proporção que quiser) — é essa composição, não um
papel fixo, que determina o quão forte, tanque ou curador cada Axie fica.
A **espécie** de um Axie (Beast/Aqua/Plant/Bird/Bug/Reptile) e sua
**função em combate** são desacopladas: qualquer espécie pode equipar
qualquer **conjunto de cartas** (Warrior/Priest/Mago/Ranger/Rogue/
Shaman) — é o conjunto, não a espécie, que decide as cartas de ataque/
defesa/cura reais daquele Axie. Cada espécie tem um conjunto "nativo"
(Bird↔Ranger, Beast↔Warrior...) que desbloqueia uma carta-assinatura
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

## Submissão (Vibeathon)

Textos prontos pro formulário (pitch, descrições, controles, Axie Core fit,
ferramentas de IA, roteiro do vídeo de fallback e checklist de direitos) em
[`SUBMISSION.md`](SUBMISSION.md); thumbnail 1280×720 em
[`submission/thumbnail.png`](submission/thumbnail.png); avisos de terceiros
em [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

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
  vitória, não muda status) — ou carrega um **arquétipo** pronto (ver
  abaixo). O rival sempre entra com um arquétipo. **Vencer = derrubar o Tanque inimigo** (as outras linhas não
  precisam morrer).
- A composição do loadout — não um papel fixo — é o que define os stats:
  - Cada carta de **Ataque** dá **+2 de dano fixo** em todo ataque daquele
    Axie (antes era +15%); o triângulo de classes ainda multiplica o golpe.
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
  escolhido no montador (Warrior/Priest/Mago/Ranger/Rogue/Shaman, ver
  seção abaixo) — qualquer espécie pode equipar qualquer conjunto. Cada
  conjunto tem uma espécie **nativa** (ex.: Ranger↔Bird, Warrior↔Beast);
  combinar as duas desbloqueia uma **carta-assinatura** bônus (geralmente
  de ataque, mas Priest↔Plant ganha uma 2ª carta de cura) — o
  off-species continua 100% jogável, só com o pool base, menor.
- **Loadout pré-definido por conjunto**: cada `CARD_SET` tem um
  `defaultCounts` (`{attack, defense, heal}`, sempre somando `LOADOUT_SIZE`)
  que já reflete a identidade daquele conjunto — Warrior `4/1/0` (quase
  tudo ataque), Priest `1/0/4` (curador puro), Mago `3/2/0` (ataque +
  defesa arcana), Ranger/Rogue `3/1/1`, Shaman `2/2/1` (equilibrado). Ao
  adicionar um Axie no time, ele já entra com o preset do seu conjunto
  nativo em vez de um split genérico; trocar de conjunto no montador
  reaplica o preset daquele novo conjunto (os steppers continuam livres
  pra ajustar manualmente depois).
- **Tempo real, sem turnos**: `energyYou`/`energyRival` regeneram
  continuamente (~0.6/s cada), e qualquer carta afordável pode ser jogada a
  qualquer momento, dos dois lados — não existe handoff "sua vez/vez do
  rival". O rival age sozinho, em intervalos aleatórios (~1.5-2.5s), via
  `ai.js`'s `aiMaybeAct`. Bleed/Poison tickam num timer fixo (a cada 2s)
  compartilhado pelos dois lados, não mais "no início do seu turno".
- **Mira: toca no alvo (fixo), depois segura e solta a carta**: toque em
  **qualquer Axie no tabuleiro** (seu ou do rival, inclusive na barra de
  vida) pra selecioná-lo — anel branco pulsante. A seleção é **fixa**:
  continua depois de jogar cartas (dá pra encadear várias no mesmo alvo),
  só muda quando você toca em outro Axie e some sozinha se o alvo morrer.
  Aí você **segura** uma carta da mão: aparece no chão de neve o **raio de
  alcance** dela em volta do Axie dono da carta, e uma faixa até quem ela
  vai atingir (`board3d.js`'s `showAim`). **Verde** = alvo dentro do
  alcance, **vermelho** = fora; os inimigos alcançáveis brilham em verde
  (`.unit-chip.in-range`). A carta **dispara ao soltar** — um ataque solto
  com o alvo fora do alcance **erra e a carta é gasta** ("MISS! Out of
  range", `result.missed`). Alvo de ataque: o inimigo selecionado **se a
  carta alcança ele**; senão, o inimigo mais próximo que ela alcança (um
  alvo marcado lá longe não faz todo ataque errar enquanto tem outro
  inimigo do seu lado); só quando ninguém está no alcance ela mira (e
  erra) no selecionado/mais próximo. Quem está dentro do raio de
  Provocação do Tanque inimigo sempre mira no Tanque. Cartas de **Defesa/Cura** não têm limite de alcance.
  **Cartas de Defesa e Cura valem pro time inteiro** (valor cheio em cada
  Axie vivo; a Cura Reversa atinge o time rival inteiro). Só **Secrets** e
  **Espinhos** continuam num alvo só. Toda carta de **Cura dá +2 de
  energia** a quem joga. Dano-base de ataque = 20% do HP de um Tanque de
  referência (média dos Tanques dos arquétipos, 166 → piso 33), vezes a
  força da carta (≥ 1: Brutal Charge 1.6, Arcane Blast 1.45...); ataques
  custam 2 de energia (os pesados e o Stun, 3). `cards.js`, seção
  "Attack damage model". Para Secrets/Espinhos, a regra antiga vale:
  **Defesa vai sempre num aliado** do jogador: o aliado com 🎯, ou (🎯 no
  inimigo / sem 🎯) o que mais precisa — Espinhos no Tanque, as outras no
  aliado mais ferido que ainda não tem aquela proteção
  (`main.js`'s `supportTargetFor`). **Cura segue o 🎯**: num aliado cura;
  num inimigo vira **Cura Reversa** (Cura → dano, Regeneração → DOT). Pra
  não pegar ninguém de surpresa, com o 🎯 num inimigo a carta de cura fica
  **vermelha com "↩ REVERSE"** e o número de dano que vai causar (antes o
  🎯 grudado num inimigo pra atacar transformava toda cura em dano sem
  aviso — parecia que a cura não funcionava). Sem 🎯, a cura vai no aliado
  mais ferido.
- **Tela de escolha de time (lobby da arena)** — primeira tela do jogo,
  inspirada no "Meus Times" do Axie Origin mas com arte própria (tudo em
  CSS + 3D): fundo de madeira escura entalhada, placa de madeira pendurada
  "Choose your Team", botões de madeira em relevo. À esquerda os 3 Axies
  do time selecionado em **3D sobre pedestais de pedra** (`src/teamStage.js`,
  com cor da classe, arma do conjunto, brilho Místico e golpes de vitrine) e
  uma placa de pedra com o nome e as tags; embaixo **📖 Team guide** (modal
  com como o time joga e as cartas de cada Axie), **✎ Edit** (abre o editor
  com o time carregado) e **⚔️ Battle!**. À direita, painéis de madeira com
  os 10 arquétipos (o selecionado com borda laranja e selo "Selected") e
  retratos 3D dos 3 Axies (renderizados um por vez, com a arte SVG até
  ficarem prontos). **✚ New Team** abre o editor vazio; um time montado ou
  editado à mão vira **"My Team"**, salvo no navegador e mostrado no topo da
  lista. O editor antigo virou a tela de edição (botão "← Teams" volta), e
  "Change team" no fim da partida volta pro lobby. Cabe na tela sem rolar em
  celular deitado, em pé e no computador.
- **Mecânicas do Axie Origin** (`game.js`): toda carta mostra seu tipo —
  **Attack** (com alcance), **Skill** (defesa/cura) ou **Secret**. Cada
  classe ganhou uma carta de **controle** (entra no pool de ataque depois
  das normais/assinatura) e um **Secret** (entra no pool de defesa):
  | Classe | Controle | Secret |
  |---|---|---|
  | Warrior | Stunning Blow — 😵 Stun 2.5s | Counterattack — revida 22 (× Power) |
  | Priest | Blinding Light — 😱 Fear | Hidden Grace — cura 26 (× MP) ao cair abaixo de ½ HP |
  | Mago | Frost Gust — 🥶 Chill 8s | Frost Trap — 12 de dano + Chill no atacante |
  | Ranger | Freezing Arrow — 🥶 Chill 8s | Hunter's Net — Stun 3s no atacante |
  | Rogue | Shadow Strike — 😱 Fear | Sombra — esquiva o golpe e dá Fear no atacante |
  | Shaman | Ancestral Howl — 😵 Stun 2s | Cursed Totem — Bleed + Poison no atacante |

  **Stun**: o Axie não joga carta, a carta que ele estava carregando é
  **interrompida**, e um Tanque atordoado não move o esquadrão. **Chill**:
  sem esquiva e o esquadrão anda a meia velocidade. **Fear** (4s): se o
  Axie atacar nesse tempo, o ataque erra por completo. Stun/Chill/Fear
  contam em segundos reais (`tickCasts`) e a Purify limpa os três.
  **Secret**: colocado virado pra baixo num aliado (a IA põe no Tanque);
  dispara sozinho quando aquele Axie é atacado e some. Você vê qual é o
  seu Secret; do rival só aparece "❓ Secret" (nem nas mensagens nem na
  barra de cast o nome dele aparece). Reequilibrado no simulador (400
  duelos por par): todos os arquétipos entre 38% e 62% (com as regras de
  time inteiro: 44%–60%, duelo médio de 63s), Fear virou janela
  de 4s pra não anular golpe demais, e o Chill virou o counter natural da
  esquiva (Miragem).
- **Controles no computador** (`main.js`, bloco "Keyboard"): **W A S D** ou
  setas movem o esquadrão igual ao joystick (W = na direção do inimigo; o
  manche na tela acompanha); as **cartas ficam no mouse**: apertar mira,
  soltar joga, arrastar pra fora (ou **Esc**) cancela; clicar num Axie
  marca o 🎯. Perder o foco da janela para o movimento. A dica "W A S D"
  só aparece em aparelhos com mouse (`@media (hover:hover) and (pointer:fine)`); no
  celular continua tudo por toque, sem mudança.
- **Clareza ao soltar uma carta** (principalmente curto × longo alcance):
  cada carta na mão diz ao vivo se alcança (`main.js`'s `reachFor`: "✅
  hits Shell" ou "❌ Shell 3.1 away · reach 2.3") e fica com borda vermelha
  quando erraria; o rótulo mostra o alcance ("🗡️ Short 2.3" / "🏹 Long 6").
  Segurando a carta, um balão acima da mão diz exatamente o que acontece ao
  soltar (dano/cura e em quem, ou "❌ MISS… walk 0.8 closer"); arrastar o
  dedo pra fora da carta (>70px) cancela e a carta fica na mão. Depois de
  soltar, um aviso confirma ("✔ Arcane Tide → Larva ⚔️ 26 · lands in
  3.2s") e o anel de alcance + a linha até o alvo ficam no tabuleiro até o
  impacto (verde = acerta, vermelho = erra); a barra de cast sobre o Axie
  mostra "carta → alvo" e fica vermelha quando o tiro já saiu fora do
  alcance.
- **Números nas cartas** (`game.js`'s `cardValues`, desenhados em
  `ui.renderHand`): cada carta mostra o que faz já com os multiplicadores
  do Axie dono — ⚔️ dano (× Power), 🏹 bônus do combo de flechas, 🩸/☠️/💀
  do status, 💚 cura (× MP; metade na Nevasca), 🌿 regeneração por tick ×
  ticks, 🛡️ redução × golpes, 🔵 absorção da Barreira, 💨 chance ×
  cargas, 🌵 reflexo × golpes. O triângulo de classes e as defesas do alvo
  ainda ajustam o golpe final.
- **Conjuração de ~5s por carta (ritmo mais lento)**: ao soltar uma carta
  ela não aplica na hora. São três tempos (`game.js`'s `CAST_LAUNCH_AT` =
  1.2s, `CAST_IMPACT_AT` = 3.2s, `CAST_TIME` = 5s):
  **carga** — runa girando no chão, coluna de luz e um orbe na cor do
  conjunto crescendo sobre o Axie (`board3d.js`'s `startCastFX`);
  **voo** — o orbe faz um arco até o alvo, seguindo a posição dele, com
  rastro (`launchCastFX`; um ataque que errou desvia pro lado); **impacto**
  — só aí as regras aplicam (`landCast` → `resolveCard`), com os efeitos de
  acerto/cura e o som, e uma onda lenta se espalha no chão
  (`landCastFX`). Durante os 5s a mão inteira fica travada ("⏳ Next card
  in 3.2s" sobre as cartas). O alcance é decidido quando você solta. O
  rival segue a mesma regra (uma carta por vez, `aiBeginCard`), e cada
  Axie conjurando mostra uma **barra de carga com o nome da carta** —
  então dá pra ver o golpe do rival vindo. Se quem conjura morrer antes do
  impacto, a carta se perde. A energia regenera mais devagar (0.3/s) pra
  acompanhar o ritmo novo.
- **Alcance em distância real**: `game.js` converte a posição de cada
  Axie pra coordenadas do tabuleiro (`worldPos`, com `ROW_Z` — o mesmo
  sistema que o `board3d.js` usa pra desenhar) e mede distância de verdade:
  curto alcance `2.3`, longo `6.0` (`RANGE`), Provocação `1.8`
  (`TAUNT_RADIUS`). Antes a distância era comparada em coordenadas locais
  espelhadas de cada lado, o que fazia andar **em direção** ao inimigo
  parecer andar pra longe — era o motivo de cartas de curto alcance
  "não funcionarem" quando você avançava.
- **Movimento livre pelo tabuleiro todo**: o joystick move o esquadrão
  inteiro (Tanque + os 2 que escoltam, em formação) por **toda a arena de
  neve**, os dois lados do campo (`ARENA`, limites em unidades do
  tabuleiro; o limite do lado da câmera é mais curto pra seu time não
  ficar embaixo do HUD; o fundo também é limitado pra ninguém sumir atrás
  da barra de energia). Os esquadrões **não se bloqueiam**: dá pra passar
  por dentro e por trás do rival sem travar. O rival também anda: na maior
  parte do tempo **se aproxima** do seu time (os ataques dele também
  precisam de alcance), às vezes desvia ou para (`pickAiWanderMove`), e só
  gasta cartas de ataque que alcançam alguém naquele momento (`ai.js`).
  O anel dourado/vermelho de Provocação **segue** cada Tanque
  (`setTauntRing`).
- **Movimento discreto**: "Move" troca o slot de formação de dois dos seus
  Axies (cooldown de 4s), mantendo o esquadrão onde ele está.
- **Arquétipos pré-montados (10)**: na tela de montar time há 10 times
  prontos, cada um construído em volta de uma sinergia, com tags e "como
  funciona" (`cards.js`'s `ARCHETYPES`): 🩸 Savage Bleed, ☠️ Plague,
  ⚔️ Steel Rain, 💚 Sanctuary, 🌵 Thorn Wall (Espinhos + Provocação contra
  corpo a corpo), 💨 Mirage (evasão contra golpes grandes), 🔵 Arcane
  Bastion (Barreira/Guarda/Purify contra burst e DOT), 💀 Deathmark
  Hunt (marca e executa), 🐍 Toxic Rush (três Rogues de Poison contra
  cura) e 🧪 Blood & Venom (Bleed + Poison juntos). "Use this team" carrega
  o time inteiro; dá pra ajustar depois. O rival sempre entra com um
  arquétipo (diferente do seu quando possível).
- **Meta escondido (a galera descobre)**: o jogo **não mostra** qual
  arquétipo é o meta, quem vence quem nem taxas de vitória — só o estilo
  e o "como funciona" de cada time. O balanceamento é feito fora do jogo
  com `scripts/simulate-meta.mjs` (`npm run meta`), que joga **todos os
  arquétipos contra todos** com o motor real (`game.js`) e a **mesma IA**
  do rival (`ai.js`) dos dois lados — 400 duelos por par, metade de cada
  lado do tabuleiro, semente fixa — e grava um relatório só pra quem
  desenvolve em `scripts/meta-results.json` (matriz de vitórias, tier por
  ranking, quem vence quem com ≥55%, e contra-meta = a melhor resposta de
  fora do tier S pra cada time S). Esse relatório não entra no jogo
  publicado. Pra chegar num meta equilibrado (39–59% de vitória, sem time
  invencível) a simulação expôs e levou a: IA que não reaplica uma defesa
  ainda ativa e põe defesas no aliado mais ferido (Espinhos no Tanque),
  Espinhos mais fortes (60% dos próximos 3 golpes), uma carta-assinatura
  nova do Priest nativo (**Purify**: remove Bleed/Poison/Deathmark
  e dá Bulwark — a IA só usa em quem tem DOT), e a Nevasca (abaixo).
- **IA por alcance**: `ai.js` serve pros dois lados. Times com maioria de
  cartas curtas avançam até encostar; times de longe mantêm distância de
  alcance longo e recuam se o inimigo chega perto (kite)
  (`aiMoveIntent`). Cura vai no aliado mais ferido (cura instantânea só
  abaixo de 85% de vida), defesa como descrito acima.
- **Nevasca (morte súbita) e limite de 3:20**: a partir de **2 minutos**
  (`BLIZZARD_AT`), a cada tique (2s) a tempestade causa dano a **todos** os
  Axies dos dois lados (2, +3 a cada 15s) e **toda cura vale metade**. A
  neve cai forte e de lado, a névoa fecha, toca um vento e aparece o aviso.
  A partida **sempre termina até 3:20** (`MATCH_LIMIT`): se os dois Tanques
  ainda estiverem de pé, vence o que tiver a maior % de vida ("Time up").
  Um relógio ao lado da energia mostra quanto falta pra Nevasca e, depois,
  pro fim. Na simulação (IA × IA) todo duelo já acaba sozinho antes disso:
  média ~2,5 min, o mais longo 2m54s — o limite é garantia pra partidas
  contra gente, que pode enrolar mais que a IA. Sem a Nevasca, dois times
  de cura/barreira empatavam por mais de 5 minutos.
- **Tutorial jogável (opcional)**: nunca abre sozinho. A tela de montar time
  mostra um convite "🎓 Play tutorial" — com "Not now" pra dispensar de vez
  (lembrado no `localStorage`) — e, depois de dispensado ou concluído, só
  fica um botão pequeno "🎓 Tutorial" ao lado do "How to Play". Dentro dele
  há "Skip tutorial" a qualquer momento. Ele abre um duelo guiado
  (`src/tutorial.js`) — Steel Rain × Deathmark Hunt — com um balão que
  explica um passo por vez e **só avança quando você faz a ação**: mover
  com o joystick, tocar num inimigo, segurar uma carta (anel de alcance),
  soltar e esperar ela aterrissar; o rival fica parado até o passo em que
  ele começa a reagir. A parte da tela em foco pisca em dourado, e o balão
  se posiciona sozinho num canto que não cubra o que ele está apontando.
- **Bleed acumula**: cada acerto de Bleed soma um acúmulo (máx. 3) e
  renova a duração pra 3 tiques; cada tique (a cada 2s) causa 4 por
  acúmulo. **Poison**: +3 acúmulos por acerto (máx. 9), cada tique causa 2
  por acúmulo e perde 1 — um acúmulo cheio dá ~90 de dano no total.
- **HUD dividido, dois dedos**: o joystick e a mão de cartas ficam em
  **zonas separadas lado a lado** (`.play-row`: `.stick-zone` na
  esquerda, `.hand-zone` na direita, com um divisor fino entre as duas) —
  dá pra segurar o joystick com um polegar e tocar numa carta com o outro
  ao mesmo tempo, sem um atrapalhar o outro. O painel de controles inteiro
  (`.controls`) fica fixo (`position:sticky`) na parte de baixo da tela.
- **Som dos golpes (sintetizado, sem arquivos de áudio)**: `src/sfx.js`
  gera cada efeito na hora com a Web Audio API (osciladores + ruído
  filtrado). O ataque muda de acordo com o conjunto da carta — **corte**
  (Warrior/Rogue), **flecha** (Ranger; 3 flechas na Chuva de
  Flechas), **magia** (Mago/Priest/Shaman) — seguido de um **impacto
  mais grave e forte quanto maior o dano**. Também tem som pra cura
  (acorde subindo), escudo/defesa (clang metálico), Vulnerável (descida
  desafinada), esquiva, veneno (bolhas), sangramento, tique de
  regeneração, nocaute de um Axie (estrondo), selecionar alvo, carta sem
  alvo e fanfarra de vitória/derrota. O áudio só liga depois do primeiro
  toque (regra dos navegadores), e o botão 🔊/🔇 ao lado da energia
  silencia tudo (lembrado entre sessões via `localStorage`).
- **Duelo sempre cabe na tela, sem rolar**: durante o duelo a página vira
  uma tela só (`body.in-duel`, altura `100dvh`, sem título da página). Em
  pé (e em tablets/telas altas) o tabuleiro estica pra ocupar o espaço que
  sobra acima dos controles, e Revanche/Trocar time viram botões pequenos
  no canto do tabuleiro; em celular estreito o contador Deck/Discard some e
  as barrinhas de energia encolhem pra caber o relógio, o som e o botão de
  tela cheia. Testado sem rolagem em 390×844, 360×640, 844×390, 667×375 e
  1024×768. Os controles respeitam o notch (`env(safe-area-inset-*)`).
- **Tela cheia**: em celular/tablet, começar um duelo já pede **tela cheia
  de verdade** (some a barra do navegador) e trava na horizontal quando o
  aparelho deixa; o botão ⛶ ao lado do som liga/desliga. No **iPhone** o
  Safari não deixa página nenhuma entrar em tela cheia, então o jogo é
  **instalável**: Compartilhar → "Adicionar à Tela de Início" abre sem
  nenhuma barra (`public/manifest.webmanifest` com `display: fullscreen`,
  ícone `public/icon.svg`, meta tags da Apple).
- **Modo paisagem (celular deitado)**: abaixo de `520px` de altura em
  paisagem (`@media (orientation:landscape) and (max-height:520px)`), o
  duelo vira um **HUD flutuante sobre o tabuleiro em tela cheia** em vez
  da faixa de controles embaixo -- energia/dica/Revanche no topo,
  joystick no canto inferior esquerdo, cartas no canto inferior direito,
  cada zona com fundo translúcido só pra legibilidade, sem nenhuma barra
  "comendo" espaço vertical. Isso deixa o jogo inteiro (tabuleiro +
  controles) cabendo numa tela só, sem rolar, exatamente como um jogo
  mobile de verdade seguraria os dois polegares nos cantos. O montador de
  time (`#deckScreen`) só reduz o que não é essencial (título, "How to
  Play", o preview 3D some no aperto) e mantém rolagem normal -- montar
  time não é tão sensível ao tempo quanto mirar no meio do duelo.
- **Campo de neve Lunacia**: o duelo acontece numa clareira de neve sob um
  céu de crepúsculo (violeta → rosa → azul-gelo, `buildSkyTexture`), com
  **neve caindo** o tempo todo (`buildSnowfall`/`tickScenery`, ~700
  flocos em `THREE.Points` que descem balançando e renascem no topo). No
  chão, entre os dois esquadrões, o **símbolo Lunacia** grande
  (`SIGIL_RADIUS` 2.8, `buildLunaciaSigilTexture` desenhado em canvas):
  runas azul-gelo, lua crescente dourada, estrela violeta e os lotes
  coloridos em volta — com uma cópia aditiva que **pulsa**, um anel de
  runas girando devagar e uma luz azul que respira sobre a neve. Chão de
  neve com sombreado azulado e brilhos (`buildSnowTexture`, textura
  tileável sem emenda). Pilares de gelo com capitel dourado e neve no
  topo, pinheiros nevados e montes de neve ficam **só no arco do fundo e
  bem afastados nas laterais** (`COLUMN_MAX_SIN`) — nada fica entre a
  câmera e a luta. A câmera usa um **FOV fechado (26) e bem recuada**, o
  que comprime a diferença de tamanho entre o time perto e o longe da
  câmera (antes o próprio Tanque aparecia como um "domo" gigante). Ao começar o duelo, os dois esquadrões nascem afastados (atrás
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
- **Animações cinematográficas por função de carta** (`src/cinematics.js`,
  disparadas em `main.js`'s `applyResultFx`): cada carta mostra em 3D o
  que ela faz. O projétil já sai com a cara do conjunto — **flecha** que
  aponta pra onde voa num arco baixo (Ranger), **lâmina giratória**
  arremessada rente ao chão (Warrior/Rogue), **orbe** num arco alto
  (Mago/Priest/Shaman). No impacto: **chuva de flechas** (5 no combo de
  flechas), **corte em crescente** (em X no Ambush ou golpe pesado),
  **explosão arcana** com coluna de luz; Bleed espirra **sangue** na neve,
  Poison deixa uma **nuvem tóxica**, Deathmark pendura uma **caveira 💀**.
  Cada defesa tem sua forma: **domo** (Guard), **muralha hexagonal
  dourada** (Bulwark), **bolha de cristal** (Barreira), **imagens
  residuais** (Esquiva), **espinhos** saindo do chão (Thorns, que também
  estouram no atacante quando refletem), **pilar de luz** (Purify).
  Cura é um **feixe do céu com folhas**; Regen, **folhas em espiral**; as
  versões revertidas viram **anel vermelho rachando** (Vulnerável) e
  **feixe sombrio drenando** (Cura Reversa). O Axie atingido faz um
  squash-and-stretch (`hitSquash`). Golpes pesados (≥18 de dano, Ambush,
  combo, Deathmark) somam **onda de choque**, tremor de câmera, **zoom
  punch** e um **hit-stop** curtinho; um **nocaute** vira **câmera lenta**
  + flash + onda de choque grande com a câmera inclinando pro Axie caído,
  e o fim da partida baixa **barras de cinema** (letterbox). A câmera
  lenta desacelera também as regras (o `gameLoop` multiplica o `dt` pelo
  `getTimeScale()`), então barras de cast e timers ficam em sincronia com
  a cena. Cada efeito é **ancorado no Axie** (`spawn(..., { side, i, p })`):
  se o Axie anda, o efeito anda junto em vez de ficar largado no chão da
  arena; os anéis de chão (onda de choque, explosão, runa do cast) são
  compactos pra ficar em volta do personagem. Todo acerto também dispara
  um **rastro de luz do atacante até o alvo** (`strikeTrail`), ligando os
  dois Axies.
- Status effects em cartas de Ataque: Bleed, **Poison** (empilha, bate 2x a
  stack atual e decai 1 stack por tick — mais forte no início, some
  sozinho), Deathmark, Retain, Ambush (2x dano no 1º acerto) e o combo de
  flechas. Toda carta de Defesa/Cura, de qualquer conjunto, tem uma
  mecânica nomeada própria. Cura num inimigo vira dano/DOT equivalente
  (Cura Reversa, ver mira acima); Defesa o jogador só usa em aliados (o
  motor ainda tem a forma revertida, **Vulnerável**, mas nenhuma mira
  leva uma Defesa até um inimigo):
  - **Guarda** (Priest): bloqueia 50% do próximo golpe.
  - **Bastião** (Warrior): reduz os próximos 3 golpes recebidos em 25%
    cada, sem limpar status (mais golpes que o Limpeza+Bastião antigo, sem
    a limpeza).
  - **Barreira** (Mago): absorve os próximos N de dano recebido de uma vez
    só, não importa quantos golpes até acabar — diferente de reduzir um
    número fixo de hits.
  - **Evasão** (Ranger/Rogue): chance de esquivar **totalmente** do
    próximo golpe (Ranger: 50% de chance, 2 cargas; Rogue: 100%
    garantido, 1 carga) — dano zero, não reduzido, e nenhum outro status
    (shield/bulwark/deathmark) é consumido nessa esquiva.
  - **Espinhos** (Shaman): reflete 40% do dano dos próximos 2 golpes de volta
    em quem bateu — pode até matar o atacante.
  - **Cura instantânea** (a maioria dos conjuntos): cura na hora, escalado
    pelo MP do conjurador.
  - **Regeneração** (Rogue/Shaman/Priest-nativo): cura um pouco a cada
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
| ⚔️ Warrior | Beast | dano bruto corpo-a-corpo, Bastião |
| 🙏 Priest | Plant | maior cura instantânea, Retain/Deathmark |
| 🔮 Mago | Aqua | nuke + status, Barreira (absorção) |
| 🏹 Ranger | Bird | chuva de flechas (combo), Evasão probabilística |
| 🗡️ Rogue | Bug | Veneno, Evasão garantida, Regeneração rápida |
| 🪶 Shaman | Reptile | Espinhos (reflete dano), a Regeneração mais longa |

Cada conjunto tem exatamente 4 cartas base (2 ataque + 1 defesa + 1 cura) e
uma **carta-assinatura** extra que só entra no pool quando a espécie do
Axie bate com a nativa do conjunto — normalmente uma 3ª carta de ataque
(ex.: Ranger+Bird ganha uma 2ª chuva de flechas), exceto Priest+Plant,
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
  nativeClassId`, e `defaultCounts` com o split de loadout pré-definido
  daquele conjunto), `buildLoadout(setId, classId, counts)` monta o pool
  real de uma Axie, fórmula de stats por contagem de cartas
  (`computeLaneStats`), e os times prontos (`ARCHETYPES`/
  `copyArchetypePicks`)
- `src/game.js` — estado do duelo (**tempo real, sem `turn`**): 3 linhas
  por lado, cada uma com um `col` (slot de formação: 0 é o centro/Tanque,
  1-2 flanqueiam) e um `localPos` ({x,z} ao vivo no espaço do próprio lado;
  `worldPos`/`ROW_Z` convertem pra coordenadas do tabuleiro). O esquadrão
  anda em bloco pela arena via `moveSquadWithTank` (`ARENA`,
  `MIN_SEPARATION`), dano, cura, status effects (Bleed acumulável, Poison,
  Barrier/Dodge/Thorns, Bulwark/Vulnerable/Regen), alcance e Provocação em
  distância real (`RANGE`/`cardRange`/`TAUNT_RADIUS`/`tauntedBy`/
  `getLegalTargets`/`nearestEnemy`/`pickAutoTarget`), ataque que erra fora
  do alcance (`playerPlayCard` → `result.missed`), mira de defesa/cura
  nos dois lados (`getSupportTargets`), movimento discreto com cooldown
  (`moveLane`/`MOVE_COOLDOWN_SEC`), regen de energia e tick de status
  contínuos (`tickEnergyRealtime`/`tickStatusTimer`), `resolveCard` recebe
  `targetSide` e despacha por `card.effect` (shield/bulwark/
  bulwark_cleanse/barrier/dodge/thorns/regen) normal-vs-revertido,
  condição de vitória (Tanque)
- `src/ai.js` — `aiMaybeAct`: chamado periodicamente pelo loop de
  `main.js` — joga 1 carta afordável; ataques só se alguém estiver no
  alcance (mira via `pickAutoTarget`). O movimento do rival fica no
  `main.js` (`pickAiWanderMove`, que se aproxima do seu time)
- `scripts/meta-results.json` — **gerado** por `npm run meta`: relatório
  de balanceamento (matriz de vitórias, tiers, counters, contra-metas).
  Só pra desenvolvimento; o jogo não usa nem mostra
- `src/tutorial.js` — o duelo guiado (balão, foco, passos que esperam a
  ação do jogador)
- `scripts/simulate-meta.mjs` — o simulador de meta (400 duelos por par)
- `scripts/duel-sim.mjs` — um duelo IA × IA sem renderização (motor real +
  IA do jogo), compartilhado pelos dois scripts abaixo; semente fixa
- `scripts/tournament.mjs` — `npm run tournament -- 200 11 out.json`:
  torneio suíço com N cópias de cada arquétipo (200 × 10 = 2.000 times),
  11 rodadas, desempate Buchholz; grava o ranking e a composição do top
  100/top 10
- `src/sfx.js` — efeitos sonoros procedurais (Web Audio API): ataque por
  conjunto + impacto escalado pelo dano, cura, escudo, status, nocaute,
  vitória/derrota, e o mudo (`toggleMute`)
- `src/cinematics.js` — as cenas 3D curtas de cada carta (corte, flechas,
  explosão, sangue, veneno, caveira, domo, muralha, bolha, espinhos,
  pilar, feixe de cura, espiral, vulnerável, dreno) + câmera (tremor, zoom
  punch, foco), câmera lenta/hit-stop, flash e letterbox; `board3d.js`
  inicializa e alimenta com cena/câmera
- `src/render.js` — feedback visual via DOM: números flutuantes, flash de
  acerto/cura, shake do tabuleiro (durações alongadas de propósito, ver
  seção acima); o burst de impacto em 3D é `board3d.js`'s `spawnImpact`,
  chamado via `ui.spawnImpact`
- `src/ui.js` — HUD/DOM (montagem de esquadrão com steppers de loadout +
  seletor de conjunto por Axie (`renderSquad`), UX do montador: rótulos de
  seção ("Your squad"/"Choose an Axie"), slots vazios fantasma (1/2/3,
  borda tracejada) indicando quantos Axies faltam escolher, barra de
  loadout colorida por categoria (ataque/defesa/cura) em vez de só um
  número, botão "Start Duel" com pulso quando o time fica válido, overlay
  de HP/nome/status
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
  momento). Todo Axie que anda de verdade -- joystick, vagar do rival,
  entrada caminhando, swap discreto -- **gira pra encarar a direção do
  movimento** (`faceDirection`/`lerpAngle`, interpolação de ângulo pelo
  caminho mais curto, deriva a direção pela diferença de posição frame a
  frame mesmo pras lanes "ao vivo" que não são donas da própria posição),
  e volta suavemente a encarar o inimigo quando fica parado de novo
  (`baseRotation`). HP/nome/status ficam em HTML posicionado por cima via
  projeção de câmera (`projectLane`) — não são modelos 3D
- `src/main.js` — entrada: wiring de DOM (incluindo o modal de ajuda) e o
  **loop de tempo real** (`requestAnimationFrame`) que regenera energia,
  tica status effects, chama a IA de cartas e o vagar autônomo do rival
  (`pickAiWanderMove`) periodicamente, e atualiza a UI — nada de handoff
  de turno

`axie-duel-prototype.html` na raiz é o protótipo original (mira física de
estilingue), mantido como referência histórica — não é mais o jogo atual.

## Axies 3D reais (Axie Mixer 3D)

**Carregamento à prova de falha** (`board3d.js` `syncBoardAxies`): no
início da partida cada Axie ganha na hora um **marcador** (bola na cor da
classe) na posição real das regras; o modelo 3D do toolkit o substitui no
mesmo lugar quando termina de baixar. Se o modelo demora (rede móvel) ou
falha, o marcador fica — mira, projéteis e efeitos continuam saindo do
Axie certo (antes, sem modelo, o efeito nascia na origem, **no centro da
arena**, e parecia que o ataque errava). A arma é equipada em segundo
plano (com limite de tempo), um aviso no tabuleiro mostra "Loading 3D
Axies n/6…" ou o erro exato, e uma falha ao baixar o manifesto é tentada
de novo na próxima partida.

**Por que os modelos não carregavam no celular** (achado pelo aviso na
tela): o toolkit carrega parte do código sob demanda (materiais Místicos,
partículas) em arquivos JS separados com hash no nome. Cada deploy troca
esses arquivos, então uma página aberta — ou em cache/instalada — antes de
um deploy pedia arquivos que já não existiam ("Failed to fetch dynamically
imported module") e nenhum modelo 3D carregava. Agora o build junta tudo
num único bundle (`vite.config.js` `inlineDynamicImports`), e se ainda
assim uma versão antiga for detectada (`vite:preloadError` ou esse erro
no carregamento) a página recarrega sozinha uma vez.

**O que o jogo usa do toolkit** (`src/axieLook.js`, compartilhado pelo
tabuleiro e pela prévia do time):
- **Cor de corpo por classe** — índice no catálogo de cores do toolkit
  (`manifest.creator.colorVariants`): Beast laranja, Plant verde, Aqua azul,
  Bug vermelho, Bird rosa, Reptile roxo (antes todos saíam brancos com
  `colorVariant: 0`).
- **Arma por conjunto de cartas** (`equipWeapon`): Warrior Sword,
  Ranger Bow, Mago Staff, Rogue Dagger, Priest Tome, Shaman Mala. Axie
  **Evoluído** usa a arma de nível 3.
- **Evoluído = Místico**: partes skin 1 (S01) com material brilhante e as
  partículas místicas do toolkit (o catálogo de partículas vem compilado no
  JS da biblioteca; só as texturas/materiais delas entram no pacote).
- **Animações do toolkit**: ao soltar uma carta o Axie faz o golpe da arma
  (`<Arma>.Attack` nos ataques, `<Arma>.Skill` em defesa/cura, na hora em
  que o projétil sai; carta em si mesmo faz a Skill enquanto carrega); quem
  apanha faz `Action.IdleGetHit`, golpe pesado (≥30, Ambush) faz
  `Default.Stun`; nocaute toca `Default.Dead` antes do modelo sumir; o time
  vencedor faz a Skill da arma no fim. Os Axies **andam/correm** de verdade
  (walk/run da arma) enquanto o esquadrão se move, em vez de deslizar.
- **Retratos 3D** (`renderAvatar`) de cada Axie da partida, com cor, arma e
  brilho místico, no canto das cartas da mão (escondidos no retrato estreito
  do celular pra não espremer o nome).
- A prévia do time mostra a classe com a arma do conjunto escolhido e o
  visual místico quando evoluído, alternando Attack/Skill de vitrine.

Ficaram de fora de propósito: os outros 7 corpos (bigyak, sumo, fuzzy...)
custam ~16-20MB de animações **cada** (sem compartilhar com o corpo
normal), pesado demais pro celular.

O team picker renderiza cada Axie como um modelo 3D real via
`@jaatster/threejs-axie-mixer3d-public` (toolkit oficial do Sky Mavis pro
Vibeathon), sem precisar de genes de carteira: `src/axie3d.js` monta um
`AxieDescriptor` explícito por classe (partes fixas, variant 2/skin 0/level 1)
e chama `mixer.create({ descriptor, ... })`.

O pacote de assets oficial tem ~512MB (5.821 arquivos, todas as
classes/variantes/níveis/armas). `public/assets/axie3d/` guarda só o
subconjunto que os 6 Axies do roster usam — corpo "normal", as 36 partes
(6 classes × olho/boca/orelha/chifre/costas/cauda) nas versões normal e
Mística, as 6 armas (nível 1 e 3), as texturas das partículas místicas e as
animações — uns 60MB em disco, mas o celular só baixa o que a partida usa
(as texturas místicas só quando há um Axie Evoluído). O `manifest.json` ali é uma cópia **inteira e sem alterações** do
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
