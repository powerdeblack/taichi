// Redes Ronin e endereços dos contratos. `npm run deploy:saigon` preenche os endereços automaticamente.
export const CONFIG = {
  rede: 'saigon',
  redes: {
    saigon: {
      chainId: 202601,
      nome: 'Ronin Saigon Testnet',
      rpc: 'https://saigon-testnet.roninchain.com/rpc',
      explorer: 'https://saigon-app.roninchain.com',
      faucet: 'https://faucet.roninchain.com',
    },
    ronin: {
      chainId: 2020,
      nome: 'Ronin',
      rpc: 'https://api.roninchain.com/rpc',
      explorer: 'https://app.roninchain.com',
    },
  },
  contratos: {
    saigon: { naveCidade: '', comandantes: '', setor: '' },
    ronin: { naveCidade: '', comandantes: '', setor: '' },
  },
};
