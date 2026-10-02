// Deploy dos contratos na Ronin: `npm run deploy:saigon` (testnet) ou `npm run deploy:ronin` (mainnet).
// Requer PRIVATE_KEY no ambiente. TESOURARIA (opcional) recebe os pagamentos; padrão = carteira do deploy.
const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

const PRECO_NAVE = ethers.parseEther(process.env.PRECO_NAVE || '5');
const PRECO_SINAL = ethers.parseEther(process.env.PRECO_SINAL || '1');
const BASE_URI = process.env.BASE_URI || 'https://guerra-sideral.example/comandantes/';

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('Defina PRIVATE_KEY com a chave da carteira deployer.');
  const tesouraria = process.env.TESOURARIA || deployer.address;
  console.log(`Rede ${network.name} (${network.config.chainId}) — deployer ${deployer.address}`);

  const nave = await ethers.deployContract('NaveCidade', [deployer.address, tesouraria, PRECO_NAVE]);
  await nave.waitForDeployment();
  const comandantes = await ethers.deployContract('Comandantes', [deployer.address, tesouraria, PRECO_SINAL, BASE_URI]);
  await comandantes.waitForDeployment();
  const setor = await ethers.deployContract('Setor');
  await setor.waitForDeployment();

  const enderecos = {
    naveCidade: await nave.getAddress(),
    comandantes: await comandantes.getAddress(),
    setor: await setor.getAddress(),
  };
  console.table(enderecos);

  const destino = path.join(__dirname, '..', 'deployments', `${network.name}.json`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify({ chainId: network.config.chainId, deployer: deployer.address, tesouraria, ...enderecos }, null, 2) + '\n');

  // Atualiza src/config.js para o jogo usar os contratos novos.
  const configPath = path.join(__dirname, '..', 'src', 'config.js');
  const config = fs.readFileSync(configPath, 'utf8');
  const bloco = `${network.name}: { naveCidade: '${enderecos.naveCidade}', comandantes: '${enderecos.comandantes}', setor: '${enderecos.setor}' }`;
  fs.writeFileSync(configPath, config.replace(new RegExp(`${network.name}: \\{ naveCidade:[^}]*\\}`), bloco));
  console.log(`Endereços salvos em deployments/${network.name}.json e src/config.js.`);
  console.log('Próximo passo do POD: registre esses contratos com a carteira deployer em https://docs.roninchain.com/proof-of-distribution/');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
