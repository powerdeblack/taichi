# Guerra Sideral — Documento de Design do Jogo (GDD)

> Nome provisório. Jogo de estratégia 4X espacial inspirado em **Rise of Kingdoms (RoK)**, construído na **Ronin** e
> desenhado para pontuar no **Proof of Distribution (POD)**.
>
> Este documento registra **como o RoK faz cada sistema** e **como adaptamos para a nossa ideia**. As descrições do RoK
> são um resumo de referência (valores exatos variam entre versões do jogo); o que vale para nós é a coluna/seção de
> adaptação.

---

## 1. Visão geral

**Pitch:** você comanda uma **Nave-Cidade** (NFT) ancorada no vazio escuro da Via Láctea. Envia **Naves de Extração**
para minerar, constrói exércitos de **drones e naves de guerra**, recruta **Comandantes** (semi-NFT) e luta ao lado da
sua **aliança** para dominar território com **Monólitos de Domínio**. Setores mais profundos guardam loot melhor — e
alianças rivais.

**Pilares**
1. **Crescer** — evoluir a Nave-Cidade, pesquisar, treinar.
2. **Explorar e coletar** — minerar no espaço, caçar piratas, abrir novos setores.
3. **Guerrear em aliança** — território, Monólitos, ataques coordenados.
4. **Possuir de verdade** — Nave-Cidade e Comandantes são ativos on-chain negociáveis.

**Princípios que diferem do RoK**
- A Nave-Cidade **nunca** pode ser roubada; o saque é só de recursos de mineração.
- Nave dentro do território da própria aliança **não pode ser atacada** (a guerra acontece nos Monólitos).
- Coleta é feita por **naves dedicadas de extração**, não pelas tropas de combate.

---

## 2. O Reino → Setor Galáctico (mapa)

| RoK | Como funciona no RoK | Guerra Sideral |
|---|---|---|
| Reino (mapa ~1200×1200) | Um servidor = um reino com milhares de jogadores. | **Setor Galáctico**: região do "Vazio Escuro" da Via Láctea. Um servidor = um setor. |
| Zonas 1, 2, 3 | Anéis do mapa separados por montanhas; só se passa por **passes** controlados. | **Borda Exterior → Braço Espiral → Núcleo Galáctico**, separados por **campos de detritos/nebulosas** intransponíveis. |
| Passes / Templo | Estruturas de guerra que abrem a passagem para a próxima zona; alianças precisam capturá-las. | **Portais Estelares**: capturar um portal abre o caminho para a zona seguinte. |
| Sítios sagrados (santuários, altares) | Capturáveis pela aliança; dão buffs para todos. | **Anomalias Ancestrais** (Pulsar, Buraco de Minhoca, Relíquia Xeno): capturáveis; dão buffs à aliança. |
| Bárbaros | NPCs de nível 1–40+ para farmar XP de comandante e itens. | **Frotas Piratas** (nível 1–30+). |
| Fortes bárbaros | Exigem rally (ataque em grupo). | **Fortalezas Xeno**: exigem Ataque Coordenado; dropam fragmentos de comandante. |
| Pontos de recurso | Campos de comida, madeira, pedra, ouro, com nível 1–5. | **Asteroides (Minério), Nebulosas (Cristal), Estrelas Anãs (Plasma)**, nível 1–5. |
| Névoa de guerra / Batedores | O mapa começa escuro; batedores exploram e acham vilas/cavernas. | **Sondas** exploram o Vazio; acham **destroços** (recompensa) e **Cavernas Gravitacionais**. |
| Teleporte | Itens para mover a cidade (aleatório, de território, avançado). | **Salto Warp**: aleatório, para o território da aliança, ou com coordenada escolhida. |
| Lost Kingdom / KvK | Temporadas em que vários reinos se enfrentam num mapa especial com mais loot. | **Setores Perdidos / Guerra de Setores**: temporadas em que setores se enfrentam num mapa profundo e rico (é o "acessar novos mapas para conseguir mais loot"). |

---

## 3. A Cidade → Nave-Cidade (NFT)

No RoK a cidade fica parada num ponto do mapa e se move por teleporte. A nossa **Nave-Cidade** é igual: tem uma
coordenada no espaço e só muda de lugar por **Salto Warp**. Ela é um **NFT ERC-721**.

| Edifício RoK | Função no RoK | Módulo da Nave-Cidade |
|---|---|---|
| Prefeitura (City Hall, nível 1–25) | Limita o nível dos demais; requisito de tudo. | **Centro de Comando** |
| Fazenda / Serraria / Pedreira / Mina de ouro | Produzem recursos passivamente. | **Extrator de Minério / Mina de Cristal / Reator de Plasma** |
| Armazém (Storehouse) | Protege parte dos recursos de saque. | **Armazém Orbital (Cofre)** |
| Quartel / Estábulo / Campo de Arqueiros / Oficina de Cerco | Treinam cada tipo de tropa. | **Hangar de Drones / Hangar de Interceptores / Doca de Artilharia / Forja de Cerco** |
| — | — | **Doca de Extração**: constrói as Naves de Extração (novidade nossa). |
| Hospital | Guarda feridos para curar. | **Baía de Reparos** |
| Muralha + Torre de Vigia | Defesa da cidade; avisa ataques chegando. | **Casco de Escudos** + **Torre de Radar** |
| Academia | Pesquisa econômica e militar. | **Laboratório Quântico** |
| Taverna | Abre baús com chaves de prata/ouro (comandantes). | **Cantina Estelar**: abre **Sinais de Recrutamento** (prata/ouro). |
| Centro da Aliança | Recebe e envia ajudas. | **Embaixada Galáctica** |
| Posto de Comércio | Envia recursos a aliados (com taxa). | **Posto de Comércio** |
| Acampamento de Batedores | Batedores exploram. | **Baía de Sondas** |
| Cabanas de Construtor | 2 filas de construção (a 2ª é temporária/paga). | **Drones Construtores**: 2 filas (a 2ª liberada por progresso ou item). |

**Regras herdadas do RoK**
- Nenhum módulo passa do nível do Centro de Comando.
- Evoluir o Centro de Comando exige outros módulos (ex.: Armazém, Casco de Escudos) no nível anterior.
- Tempos crescem por nível; podem ser reduzidos por **aceleradores** e **ajuda da aliança**.

**Progresso on-chain:** o nível do Centro de Comando (e um resumo da nave) é gravado no NFT. Uma nave evoluída vale mais
no **Mavis Market** — isso gera **volume de NFT**, métrica de maior peso do POD.

---

## 4. Recursos e saque

| RoK | Guerra Sideral | Uso principal |
|---|---|---|
| Comida | **Minério** | Tudo: tropas, construção. |
| Madeira | **Cristal** | Construção, tropas de longo alcance. |
| Pedra | **Liga Estelar** *(fase 2)* | Construções avançadas, cerco. |
| Ouro | **Plasma** | Pesquisa, tropas de alto nível, comandantes. |
| Gemas | **Quasares** | Moeda premium: acelerar, itens, recrutamento. |

**Como o RoK protege recursos e como adotamos (decidido):**
- O saque **só leva recursos de mineração** — nunca NFTs, comandantes ou naves.
- **Cofre do Armazém:** uma quantidade por recurso é intocável (cresce com o nível do Armazém).
- **Recursos em caixas** (itens de inventário) não podem ser saqueados até serem abertos.
- **Recurso gasto** (em construção/treino/pesquisa) não pode ser saqueado.
- **Escudo de Paz** (item): a nave não pode ser atacada por algumas horas.
- **Dentro do território da aliança a nave não pode ser atacada** (regra nossa, mais forte que no RoK).
- O atacante leva **uma porcentagem** (15–30%) apenas do que excede o cofre.
- Naves de Extração **fora do território** podem ser interceptadas e perder a carga.

> Resultado: o jogador que conhece o jogo praticamente não perde nada; o descuidado perde um pouco.

---

## 5. Tropas → Naves e Drones

**RoK:** 4 tipos de tropa (infantaria, cavalaria, arqueiros, cerco), cada um em **5 tiers (T1–T5)**. Há um triângulo de
vantagem: infantaria > cavalaria > arqueiros > infantaria; cerco é fraco em campo, forte contra cidades e fortes.
Qualquer tropa coleta recursos (pela capacidade de carga).

| RoK | Guerra Sideral | Papel |
|---|---|---|
| Infantaria | **Drones de Enxame** | Baratos, numerosos, alta defesa. Fortes contra Interceptores. |
| Cavalaria | **Interceptores** | Rápidos, alto ataque. Fortes contra Artilharia. |
| Arqueiros | **Fragatas de Artilharia** | Dano alto, frágeis. Fortes contra Drones. |
| Cerco | **Couraçados de Cerco** | Dano dobrado contra Monólitos, Fortalezas e Naves-Cidade. |
| (qualquer tropa coleta) | **Naves de Extração** *(novidade)* | Muita carga, coleta rápida, quase sem combate. |

- **Tiers:** Mk I a Mk V (como T1–T5), liberados pelo nível do hangar e por pesquisa.
- **Perdas (como no RoK):** em batalha as baixas viram **levemente feridas** (voltam sozinhas), **gravemente feridas**
  (vão para a Baía de Reparos até a capacidade) ou **destruídas** (excesso do hospital). Na defesa da própria nave,
  mais tropas vão para o hospital do que em ataque.

---

## 6. Comandantes → Comandantes semi-NFT (ERC-1155)

**RoK:**
- Raridades: **Lendário, Épico, Elite, Avançado**.
- Desbloqueio e evolução por **esculturas** do comandante (e esculturas universais por raridade).
- **Estrelas** (1–6) liberam nível máximo e slots de talento; **habilidades** (4–5 por comandante) sobem com esculturas.
- **Árvore de talentos** (3 ramos, ex.: Infantaria / Liderança / Ataque) com pontos ganhos por nível.
- Marcha com **comandante principal + secundário**; cada um com equipamentos.
- XP vem de batalhas (bárbaros), livros de XP e eventos.

**Guerra Sideral:**
- Cada comandante é um **ID de token ERC-1155**; cada unidade desse ID é um **Fragmento de Comandante** (= escultura).
- **Desbloquear:** juntar N fragmentos e "forjar" o comandante (queima fragmentos → transação on-chain).
- **Estrelas e habilidades:** mais fragmentos queimados sobem estrelas/habilidades.
- **Fragmentos Universais** por raridade (como as esculturas douradas/roxas do RoK).
- **Fontes:** Sinais de Recrutamento (Cantina), Fortalezas Xeno, eventos, missões e **mercado** (Mavis Market).
- Marcha com **principal + secundário**; árvore de talentos e equipamentos na fase 2.
- Fragmentos negociáveis = **volume de NFT** e transações para o POD.

Comandantes iniciais (já no código, ajustáveis): **Kaito, o Ronin Estelar** (ataque), **Orion Drake** (velocidade e
coleta), **Vega Solaris** (defesa), **Nyx Valkyria** (ataque e caça a piratas).

---

## 7. Aliança e território

**RoK:**
- Até ~150 membros, cargos **R1–R5** (líder R5, oficiais R4).
- **Bandeiras** marcam território; precisam se conectar à **Fortaleza da Aliança** ou a outra bandeira.
- Território dá **recursos da aliança** (pontos de crédito/recurso), bônus de coleta e teleporte para dentro.
- **Rally** (ataque em grupo), **guarnição** (reforçar estruturas/aliados), **ajudas**, **presentes**, **tecnologia da
  aliança**, **loja da aliança**.
- Estruturas da aliança são atacáveis; ao destruir bandeiras, o território encolhe.

**Guerra Sideral:**
| RoK | Guerra Sideral |
|---|---|
| Fortaleza da Aliança | **Estação Central da Aliança**: primeira estrutura, origem do território. |
| Bandeira | **Monólito de Domínio**: rocha cristalina ancorada no espaço; controla uma área (ex.: 5×5). Precisa estar conectado ao território. |
| Território | Área colorida no mapa; **naves-cidade dentro dele não podem ser atacadas**. |
| Recursos da aliança | **Cristais de Domínio**: gerados por território; pagam novos Monólitos e tecnologia. |
| Rally | **Ataque Coordenado**: vários membros juntam frotas num ataque com tempo de preparação. |
| Guarnição | **Reforço de Monólito**: membros enviam naves para defender a rocha. |
| Ajuda / Presentes / Tecnologia / Loja | Mantidos com os mesmos nomes. |

**Ciclo de guerra por território**
1. A aliança ergue Monólitos, expandindo território (zona segura + bônus).
2. Rivais atacam os **Monólitos da borda** com Couraçados de Cerco e Ataques Coordenados.
3. Monólito destruído → aquela área deixa de ser território → naves ali ficam **vulneráveis**.
4. Defender exige reforçar Monólitos e manter a conexão do território; capturar Portais e Anomalias exige território
   conectado a eles.

On-chain: erguer, capturar e destruir Monólitos são registrados no **contrato do Setor** (gás e volume de contrato para o
POD).

---

## 8. Combate

**RoK:** marchas visíveis no mapa; batalha em campo aberto acontece em rodadas até um lado recuar ou acabar; o dano
depende de ataque, defesa, vida, quantidade, habilidades de comandante e vantagem de tipo; a **Torre de Vigia** avisa
ataques; **batedores** espionam antes.

**Guerra Sideral (implementado em `src/engine.js`, versão determinística simplificada):**
- Marcha: tempo = distância × tempo por casa ÷ velocidade da nave mais lenta (bônus de comandante e de pesquisa).
- Batalha em rodadas simultâneas: dano ∝ quantidade × ataque × bônus × vantagem de tipo; baixas ∝ dano ÷ (vida × defesa).
- Vantagem de tipo: +30% proporcional à fração do inimigo que é o tipo "fraco".
- Cerco: dano ×2 contra Fortalezas e Monólitos.
- Feridos → Baía de Reparos até a capacidade; o excedente é perdido.
- A fazer: rally, guarnição, sondas/espionagem, aviso da Torre de Radar, habilidades com fúria (rage) como no RoK.

---

## 9. Progressão e conteúdo

| RoK | Guerra Sideral |
|---|---|
| Missões principais, secundárias e diárias | **Missões** (já no código) + diárias. |
| Conquistas | **Conquistas** (fase 2). |
| VIP | **Patente de Frota** (fase 2): bônus por pontos acumulados. |
| Pesquisa econômica e militar | **Laboratório Quântico** (já no código: Mineração, Canhões, Blindagem, Warp, Logística, Engenharia). |
| Expedição (PvE por estágios) | **Campanha Pirata** (fase 2). |
| Sunset Canyon (arena) | **Arena Orbital** (fase 3). |
| Eventos (Mightiest Governor, Ceroli Crisis, Ark of Osiris…) | **Eventos de temporada**: Comandante Supremo, Invasão Xeno, Arca Estelar (captura de relíquia entre alianças). |
| Lost Kingdom / KvK | **Guerra de Setores** (fase 3). |
| Invasões bárbaras e eventos de horda | **Invasões Piratas** à base (já no código). |

---

## 10. Economia Web3 e POD

**Monetização do RoK:** gemas, pacotes, VIP, passes. Para nós, a receita vem principalmente de **mint e mercado**,
evitando "pay-to-win" pesado.

### Contratos (Ronin)
| Contrato | Padrão | Conteúdo |
|---|---|---|
| `NaveCidade` | ERC-721 | Mint da nave (1ª grátis, demais pagas em RON); nível/resumo gravado on-chain. |
| `Comandantes` | ERC-1155 | Fragmentos por comandante + universais; forjar/evoluir queimando fragmentos. |
| `Setor` | Contrato do jogo | Registro de jogadores, check-in diário, Monólitos (erguer/capturar), placar. |
| `Quasar` *(opcional)* | ERC-20 | Token do jogo; listar na **Katana** gera volume de DEX. |

### Mapa das métricas do POD
| Métrica do Builder Score | O que no jogo gera |
|---|---|
| Gás gasto | Mint, forja de comandantes, check-in diário, Monólitos. |
| Usuários ativos e novos (com > 10 RON) | Check-in diário, missões on-chain, temporadas. |
| Volume de NFT | Naves-Cidade e fragmentos de comandante no Mavis Market. |
| Volume de DEX | Par QSR/RON na Katana (se o token existir). |
| Volume de contrato | Todas as ações on-chain acima. |

**Requisito de registro do POD:** ter ao menos um contrato deployado na Ronin, registrado pela carteira deployer, e uma
carteira de tesouraria para receber RON.

**Redes:** Ronin mainnet (chain ID 2020) e testnet **Saigon** (agora um L2 da Ethereum, chain ID **202601**,
RPC `https://saigon-testnet.roninchain.com/rpc`).

### Segurança e honestidade das ações on-chain
- Nada que dependa de resultado de batalha calculado no navegador deve cunhar valor on-chain sem validação: na fase 2
  o servidor do jogo assina os resultados (assinatura verificada no contrato).
- Na fase 1, só ações sem risco de trapaça cunham algo (mint pago, check-in limitado por carteira e por dia).

---

## 11. Fases

**Fase 1 — MVP (navegador, 1 jogador + bots)**
- Nave-Cidade com módulos, recursos, filas, pesquisa, missões.
- Mapa do Setor com Naves de Extração, Piratas, Fortalezas, Invasões.
- Alianças rivais controladas pelo jogo com Monólitos e território (zona segura).
- Ronin Wallet + contratos na Saigon: mint da Nave-Cidade, fragmentos de comandante, check-in diário.

**Fase 2 — Multiplayer**
- Servidor autoritativo (estado do setor, batalhas, alianças reais, chat).
- Resultados assinados pelo servidor para ações on-chain.
- Ataque Coordenado, reforços, sondas, Torre de Radar, tiers Mk II–V, talentos.

**Fase 3 — Temporadas**
- Guerra de Setores, Arena Orbital, eventos, token QSR na Katana.

---

## 12. Estado atual do código

| Já existe (`src/engine.js`, `src/data.js`) | Precisa adaptar a este GDD |
|---|---|
| Módulos com níveis, custos, tempos e requisitos | Renomear naves (Drones, Interceptores, Artilharia) e adicionar **Naves de Extração** + Doca de Extração |
| Produção, capacidade e cofre do Armazém | Caixas de recurso no inventário, Escudo de Paz |
| Mapa com recursos, piratas e fortalezas | **Monólitos**, território, alianças-bot, zona segura, Portais e Setores |
| Marchas de coleta e ataque, combate, feridos | Coleta só por Naves de Extração; interceptação fora do território |
| Comandantes com bônus e XP | Fragmentos (ERC-1155), estrelas, principal + secundário |
| Pesquisas, missões, ajuda e presentes da aliança, invasões piratas | Interface no navegador, Ronin Wallet, contratos |
