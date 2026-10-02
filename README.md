# 🛸 Guerra Sideral

Jogo de estratégia espacial inspirado em **Rise of Kingdoms**, construído na **Ronin** e desenhado para o
**Proof of Distribution (POD)**. Sua base é uma **Nave-Cidade (NFT)** ancorada no vazio da Via Láctea; você coleta com
**Naves de Extração**, monta exércitos de **drones e naves de guerra**, recruta **Comandantes semi-NFT** e disputa
território com sua aliança usando **Monólitos de Domínio**.

O design completo, sistema por sistema (RoK → Guerra Sideral), está em [`docs/GDD.md`](docs/GDD.md).

## Como jogar (local)

```bash
npm install
npm start          # abre em http://localhost:8080
```

O jogo roda no navegador e salva o progresso localmente, uma partida por Nave-Cidade. Sem carteira ele funciona em modo
local; com a [Ronin Wallet](https://wallet.roninchain.com) você cria a Nave-Cidade NFT, abre Sinais on-chain e faz o
check-in diário.

### O que já existe (Fase 1)

| Sistema | Resumo |
|---|---|
| Nave-Cidade | 16 módulos (Centro de Comando, extratores, hangares, Laboratório, Cantina, Radar, Embaixada…) com filas e requisitos no estilo RoK |
| Naves | Drones de Enxame > Interceptores > Fragatas de Artilharia > Drones; Couraçados de Cerco (×2 contra estruturas); Naves de Extração (únicas que coletam) |
| Galáxia | Mapa 40×40 com Borda Exterior, Braço Espiral e Núcleo Galáctico; Portais Estelares liberam zonas com loot melhor |
| Comandantes | 6 comandantes com fragmentos, estrelas (1–5), nível, comandante principal + secundário |
| Aliança | Estação Central + Monólitos de Domínio formam território; **dentro dele a Nave-Cidade não pode ser atacada** |
| Guerra | Alianças rivais (bots) expandem e atacam seus Monólitos; você reforça os seus e destrói os delas |
| Saque | Só recursos de mineração, e só o que passa do cofre; caixas no inventário, Escudo de Paz e território protegem |
| Progressão | Pesquisas, missões, presentes e ajuda da aliança, Cantina com Sinais, invasões piratas, progresso offline |

## Contratos (Ronin)

| Contrato | Padrão | Função |
|---|---|---|
| [`NaveCidade.sol`](contracts/NaveCidade.sol) | ERC-721 | Nave-Cidade; 1ª grátis (só gás), demais pagas em RON; metadados on-chain; nível só via OPERADOR |
| [`Comandantes.sol`](contracts/Comandantes.sol) | ERC-1155 | Fragmentos de comandante; Sinais pagos em RON; forjar e evoluir estrelas queimando fragmentos |
| [`Setor.sol`](contracts/Setor.sol) | — | Registro do jogador, check-in diário com sequência e marcos de Monólitos |

### Deploy na testnet Saigon

A Saigon hoje é um L2 da Ethereum (chain ID **202601**). Pegue RON de teste no
[faucet](https://faucet.roninchain.com) e rode:

```bash
PRIVATE_KEY=0xSUA_CHAVE npm run deploy:saigon
# opcionais: TESOURARIA=0x...  PRECO_NAVE=5  PRECO_SINAL=1  BASE_URI=https://.../comandantes/
```

O script publica os 3 contratos, grava os endereços em `deployments/saigon.json` e atualiza `src/config.js`.
Para a mainnet use `npm run deploy:ronin` e troque `rede` em `src/config.js` para `'ronin'`.

> O compilador usado é o `solc` do npm (0.8.28), sem downloads extras.

### Registro no Proof of Distribution

1. Faça o deploy com a carteira que será a **admin do projeto** (o POD prefere verificação pela carteira deployer).
2. Acesse o [Proof of Distribution](https://docs.roninchain.com/proof-of-distribution/), conecte essa carteira, preencha
   os dados do projeto e informe a **carteira de tesouraria** para receber RON.
3. Adicione os três contratos (`deployments/<rede>.json`) e assine por cada um.

O que no jogo alimenta o Builder Score:

| Métrica | Ação no jogo |
|---|---|
| Gás gasto | Mint de naves, Sinais, forja/estrelas, check-in, Monólitos |
| Usuários ativos e novos | Check-in diário com sequência |
| Volume de NFT | Naves-Cidade e fragmentos de comandante em marketplaces |
| Volume de contrato | Todas as ações acima |

## Testes

```bash
npm test              # tudo
npm run test:jogo     # regras do jogo (node:test)
npm run test:contratos  # contratos (Hardhat, rede local em memória)
```

## Estrutura

```
index.html, styles.css   interface
src/data.js              conteúdo: módulos, naves, comandantes, pesquisas, missões
src/engine.js            regras do jogo (puras, testáveis)
src/combate.js           combate em rodadas
src/territorio.js        zonas e território das alianças
src/mapa.js              desenho da galáxia (canvas)
src/ui.js, src/main.js   telas, loop, salvamento e ações
src/wallet.js            Ronin Wallet + contratos (ethers via CDN)
src/config.js            redes e endereços dos contratos
contracts/               Solidity + testes (contracts/specs)
scripts/deploy.cjs       deploy na Ronin
docs/GDD.md              documento de design
```

## Próximas fases

- **Fase 2 — multiplayer:** servidor autoritativo com alianças reais, Ataque Coordenado, chat; o servidor recebe o papel
  `OPERADOR` para atualizar o nível das naves e cunhar recompensas com resultados validados.
- **Fase 3 — temporadas:** Guerra de Setores (KvK), Arena Orbital, eventos, token QSR na Katana.
- **Antes da mainnet:** trocar a aleatoriedade de `abrirSinal` pelo Ronin VRF e auditar os contratos.
