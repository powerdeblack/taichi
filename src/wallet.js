// Integração com a Ronin Wallet (extensão injeta `window.ronin.provider`, EIP-1193) e com os contratos do jogo.
import { CONFIG } from './config.js';

const ETHERS_URL = 'https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm';

const ABI = {
  naveCidade: [
    'function criarNave(string nome) payable returns (uint256)',
    'function precoPara(address conta) view returns (uint256)',
    'function navesDe(address dono) view returns (uint256[])',
    'function dados(uint256 tokenId) view returns (tuple(string nome, uint8 nivelComando, uint64 criadaEm))',
    'event NaveCriada(uint256 indexed tokenId, address indexed dono, string nome, uint256 preco)',
  ],
  comandantes: [
    'function precoSinal() view returns (uint256)',
    'function abrirSinal(uint256 quantidade) payable',
    'function forjar(uint256 id)',
    'function evoluirEstrela(uint256 id)',
    'function estrelasDe(address jogador) view returns (uint8[6])',
    'function balanceOfBatch(address[] contas, uint256[] ids) view returns (uint256[])',
  ],
  setor: [
    'function registrar(string nome)',
    'function checkIn()',
    'function ancorarMonolito(uint16 x, uint16 y)',
    'function diaAtual() view returns (uint32)',
    'function jogadores(address) view returns (string nome, uint32 ultimoDia, uint32 sequencia, uint32 totalCheckIns, uint64 registradoEm, uint8 monolitos)',
    'function monolitoEm(uint32) view returns (address)',
  ],
};

export const IDS_FRAGMENTOS = [1, 2, 3, 4, 5, 6, 101, 102];

let ethersLib = null;
const carregarEthers = async () => (ethersLib ??= await import(ETHERS_URL));

export const rede = () => CONFIG.redes[CONFIG.rede];
export const contratos = () => CONFIG.contratos[CONFIG.rede];
export const contratosConfigurados = () => Object.values(contratos()).every(Boolean);
export const providerInjetado = () => window.ronin?.provider || window.ethereum || null;
export const nomeCarteira = () => (window.ronin?.provider ? 'Ronin Wallet' : window.ethereum ? 'Carteira EVM' : null);
export const linkTx = (hash) => `${rede().explorer}/tx/${hash}`;

export async function conectar() {
  const injetado = providerInjetado();
  if (!injetado) throw new Error('Instale a Ronin Wallet: https://wallet.roninchain.com');
  const [endereco] = await injetado.request({ method: 'eth_requestAccounts' });
  await garantirRede(injetado);
  return endereco;
}

async function garantirRede(injetado) {
  const alvo = '0x' + rede().chainId.toString(16);
  const atual = await injetado.request({ method: 'eth_chainId' });
  if (atual?.toLowerCase() === alvo) return;
  try {
    await injetado.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: alvo }] });
  } catch (e) {
    if (e.code !== 4902) throw e;
    await injetado.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId: alvo, chainName: rede().nome, rpcUrls: [rede().rpc], blockExplorerUrls: [rede().explorer], nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 } }],
    });
  }
}

async function leitura() {
  const { ethers } = await carregarEthers();
  return new ethers.JsonRpcProvider(rede().rpc, rede().chainId);
}

async function contrato(nome, comAssinatura) {
  const { ethers } = await carregarEthers();
  const endereco = contratos()[nome];
  if (!endereco) throw new Error('Contratos ainda não publicados nesta rede (rode npm run deploy:saigon).');
  if (!comAssinatura) return new ethers.Contract(endereco, ABI[nome], await leitura());
  const signer = await new ethers.BrowserProvider(providerInjetado()).getSigner();
  return new ethers.Contract(endereco, ABI[nome], signer);
}

async function enviar(promessaTx) {
  const tx = await promessaTx;
  const recibo = await tx.wait();
  return { hash: tx.hash, recibo };
}

export const formatarRon = async (wei) => (await carregarEthers()).ethers.formatEther(wei);

export async function saldoRon(endereco) {
  return formatarRon(await (await leitura()).getBalance(endereco));
}

// ----- Nave-Cidade (ERC-721) -----

export async function listarNaves(endereco) {
  const c = await contrato('naveCidade');
  const ids = await c.navesDe(endereco);
  return Promise.all(ids.map(async (id) => {
    const d = await c.dados(id);
    return { tokenId: Number(id), nome: d.nome, nivelComando: Number(d.nivelComando) };
  }));
}

export async function precoNave(endereco) {
  return (await contrato('naveCidade')).precoPara(endereco);
}

export async function criarNave(endereco, nome) {
  const c = await contrato('naveCidade', true);
  const preco = await (await contrato('naveCidade')).precoPara(endereco);
  return enviar(c.criarNave(nome, { value: preco }));
}

// ----- Comandantes (ERC-1155) -----

export async function fragmentosOnChain(endereco) {
  const c = await contrato('comandantes');
  const saldos = await c.balanceOfBatch(IDS_FRAGMENTOS.map(() => endereco), IDS_FRAGMENTOS);
  return Object.fromEntries(IDS_FRAGMENTOS.map((id, i) => [id, Number(saldos[i])]));
}

export async function estrelasOnChain(endereco) {
  return (await (await contrato('comandantes')).estrelasDe(endereco)).map(Number);
}

export async function precoSinal() {
  return (await contrato('comandantes')).precoSinal();
}

export async function abrirSinalOnChain(qtd) {
  const preco = await precoSinal();
  return enviar((await contrato('comandantes', true)).abrirSinal(qtd, { value: preco * BigInt(qtd) }));
}

export async function forjarOnChain(tokenId) {
  return enviar((await contrato('comandantes', true)).forjar(tokenId));
}

export async function evoluirEstrelaOnChain(tokenId) {
  return enviar((await contrato('comandantes', true)).evoluirEstrela(tokenId));
}

// ----- Setor -----

export async function jogadorSetor(endereco) {
  const c = await contrato('setor');
  const [j, hoje] = await Promise.all([c.jogadores(endereco), c.diaAtual()]);
  return {
    registrado: j.registradoEm > 0n,
    nome: j.nome,
    ultimoDia: Number(j.ultimoDia),
    sequencia: Number(j.sequencia),
    total: Number(j.totalCheckIns),
    monolitos: Number(j.monolitos),
    hoje: Number(hoje),
  };
}

export async function registrarNoSetor(nome) {
  return enviar((await contrato('setor', true)).registrar(nome));
}

export async function fazerCheckIn() {
  return enviar((await contrato('setor', true)).checkIn());
}

export async function ancorarMonolitoOnChain(x, y) {
  return enviar((await contrato('setor', true)).ancorarMonolito(x, y));
}

// Erros de contrato/carteira em texto amigável.
export function mensagemErro(e) {
  if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') return 'Transação recusada na carteira.';
  if (e?.code === 'INSUFFICIENT_FUNDS') return 'RON insuficiente para a transação.';
  const nome = e?.revert?.name || e?.errorName;
  if (nome) return `Contrato recusou: ${nome}`;
  return e?.shortMessage || e?.message || String(e);
}
