# Axie Duel

Protótipo de duelo em tabuleiro 3D pro Axie Vibeathon (Sky Mavis / Axie
Infinity), ambientado num **campo de neve Lunacia** (neve caindo, céu de
crepúsculo e o símbolo Lunacia grande e brilhante no chão): esquadrão
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
  vitória, não muda status) — ou carrega um **arquétipo** pronto (ver
  abaixo). O rival sempre entra com um arquétipo. **Vencer = derrubar o Tanque inimigo** (as outras linhas não
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
- **Loadout pré-definido por conjunto**: cada `CARD_SET` tem um
  `defaultCounts` (`{attack, defense, heal}`, sempre somando `LOADOUT_SIZE`)
  que já reflete a identidade daquele conjunto — Guerreiro `4/1/0` (quase
  tudo ataque), Sacerdote `1/0/4` (curador puro), Mago `3/2/0` (ataque +
  defesa arcana), Arqueiro/Ladino `3/1/1`, Xamã `2/2/1` (equilibrado). Ao
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
  range", `game.js`'s `playerPlayCard`/`result.missed`). Alvo de ataque: o
  inimigo selecionado, senão o inimigo mais próximo (`nearestEnemy`);
  quem está dentro do raio de Provocação do Tanque inimigo sempre mira no
  Tanque. Cartas de **Defesa/Cura** não têm limite de alcance: aliado
  selecionado = efeito normal, inimigo = **revertido** (Cura Reversa, igual
  ao Origin — Guarda/Bulwark/Barreira/Evasão/Espinhos viram
  **Vulnerável**, Cura/Regeneração viram **dano/DOT**); sem seleção, vai no
  próprio Axie da carta.
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
  ficar embaixo do HUD). Ninguém atravessa um Axie inimigo — o esquadrão é
  empurrado de volta pra `MIN_SEPARATION`. O rival também anda: na maior
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
  Bastion (Barreira/Guarda/Purificação contra burst e DOT), 💀 Deathmark
  Hunt (marca e executa), 🐍 Toxic Rush (três Ladinos de Poison contra
  cura) e 🧪 Blood & Venom (Bleed + Poison juntos). "Use this team" carrega
  o time inteiro; dá pra ajustar depois. O rival sempre entra com um
  arquétipo (diferente do seu quando possível).
- **Meta e contra-meta (simulado, não chutado)**: `scripts/simulate-meta.mjs`
  (`npm run meta`) joga **todos os arquétipos contra todos** com o motor
  real (`game.js`) e a **mesma IA** do rival (`ai.js`) dos dois lados — 400
  duelos por par, metade de cada lado do tabuleiro, semente fixa (sempre
  gera o mesmo resultado) — e grava `src/metaData.js`: matriz de vitórias,
  taxa de vitória geral, **tier** por ranking (S = top 2 = o meta, depois
  A/B/C), **"Beats"** (vence o confronto em ≥55%), **"Countered by"** e
  **contra-meta** (time fora do S que vence algum time S). A tela mostra
  os arquétipos nessa ordem com selo de tier, % de vitória, 🏆 META ou
  🎯 COUNTER-META, e uma **tabela de confrontos** (escala divergente: azul =
  a linha vence, vermelho = perde, cinza = equilibrado; toque numa célula
  pra ler o confronto). Rodar de novo depois de mexer em cartas/regras
  atualiza tudo. Pra chegar num meta equilibrado (41–57% de vitória, sem
  time invencível) a simulação expôs e levou a: IA que não reaplica uma
  defesa ainda ativa e põe defesas no aliado mais ferido (Espinhos no
  Tanque), Espinhos mais fortes (60% dos próximos 3 golpes), uma
  carta-assinatura nova do Sacerdote nativo (**Purificação**: remove
  Bleed/Poison/Deathmark e dá Bulwark — a IA só usa em quem tem DOT), e a
  Nevasca (abaixo).
- **IA por alcance**: `ai.js` serve pros dois lados. Times com maioria de
  cartas curtas avançam até encostar; times de longe mantêm distância de
  alcance longo e recuam se o inimigo chega perto (kite)
  (`aiMoveIntent`). Cura vai no aliado mais ferido (cura instantânea só
  abaixo de 85% de vida), defesa como descrito acima.
- **Nevasca (morte súbita)**: a partir de **2 minutos** de duelo
  (`BLIZZARD_AT`), a cada tique (2s) a tempestade causa dano a **todos** os
  Axies dos dois lados (2, +2 a cada 20s) e **toda cura vale metade**. A
  neve cai forte e de lado, a névoa fecha, toca um vento e aparece o aviso.
  Sem isso, dois times de cura/barreira empatavam por mais de 5 minutos
  (na simulação, 80% dos duelos Toxic Rush × Arcane Bastion estouravam o
  limite); com ela, a média é ~2,6 min e nenhum duelo trava.
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
  (Guerreiro/Ladino), **flecha** (Arqueiro; 3 flechas na Chuva de
  Flechas), **magia** (Mago/Sacerdote/Xamã) — seguido de um **impacto
  mais grave e forte quanto maior o dano**. Também tem som pra cura
  (acorde subindo), escudo/defesa (clang metálico), Vulnerável (descida
  desafinada), esquiva, veneno (bolhas), sangramento, tique de
  regeneração, nocaute de um Axie (estrondo), selecionar alvo, carta sem
  alvo e fanfarra de vitória/derrota. O áudio só liga depois do primeiro
  toque (regra dos navegadores), e o botão 🔊/🔇 ao lado da energia
  silencia tudo (lembrado entre sessões via `localStorage`).
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
- `src/metaData.js` — **gerado** por `npm run meta` (não editar à mão):
  matriz de vitórias, tiers, counters e contra-metas dos arquétipos
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
