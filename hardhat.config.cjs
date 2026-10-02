require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const path = require('path');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');

// Usa o solc-js do npm (node_modules/solc) em vez de baixar o compilador de binaries.soliditylang.org.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async ({ solcVersion }, hre, runSuper) => {
  const solc = require('solc');
  if (solc.version().startsWith(solcVersion)) {
    return { compilerPath: path.join(__dirname, 'node_modules/solc/soljson.js'), isSolcJs: true, version: solcVersion, longVersion: solc.version() };
  }
  return runSuper();
});

// Redes Ronin. Saigon (testnet) virou um L2 da Ethereum: chain ID 202601.
const contas = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  paths: { sources: './contracts', tests: './contracts/specs', artifacts: './artifacts', cache: './cache' },
  networks: {
    saigon: { url: process.env.SAIGON_RPC || 'https://saigon-testnet.roninchain.com/rpc', chainId: 202601, accounts: contas },
    ronin: { url: process.env.RONIN_RPC || 'https://api.roninchain.com/rpc', chainId: 2020, accounts: contas },
  },
};
