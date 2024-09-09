document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connectButton');
    const balanceElement = document.getElementById('balance');
    const btcValueElement = document.getElementById('btcValue');
    const ethValueElement = document.getElementById('ethValue');
    const astarValueElement = document.getElementById('astarValue');
    const portfolioSection = document.getElementById('portfolioSection');
    const portfolioLink = document.getElementById('portfolioLink');

    async function connectMetaMask() {
        if (window.ethereum) {
            try {
                // Solicita ao usuário para conectar sua conta MetaMask
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                if (accounts.length > 0) {
                    // Recupera o saldo da primeira conta
                    const balance = await window.ethereum.request({
                        method: 'eth_getBalance',
                        params: [accounts[0], 'latest']
                    });
                    const balanceInEth = parseFloat(balance) / 1e18;
                    balanceElement.textContent = `${balanceInEth.toFixed(4)} ETH`;
                } else {
                    balanceElement.textContent = 'Conta não encontrada. Conecte sua conta MetaMask.';
                }
            } catch (error) {
                console.error('Erro ao conectar ao MetaMask:', error);
                alert('Falha ao conectar ao MetaMask. Verifique se a extensão está instalada e se você está conectado.');
                balanceElement.textContent = 'Erro ao conectar ao MetaMask';
            }
        } else {
            alert('MetaMask não detectado. Instale a extensão MetaMask.');
            balanceElement.textContent = 'MetaMask não detectado';
        }
    }

    async function fetchCryptoValues() {
        try {
            // Fetch os preços das criptomoedas usando a API CoinGecko
            const [responseBtc, responseEth, responseAstar] = await Promise.all([
                fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'),
                fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'),
                fetch('https://api.coingecko.com/api/v3/simple/price?ids=astar&vs_currencies=usd')
            ]);

            // Verifica se todas as respostas foram bem-sucedidas
            if (!responseBtc.ok || !responseEth.ok || !responseAstar.ok) {
                throw new Error('Erro ao buscar dados das criptomoedas');
            }

            // Converte as respostas em JSON
            const dataBtc = await responseBtc.json();
            const dataEth = await responseEth.json();
            const dataAstar = await responseAstar.json();

            // Atualiza os valores na página
            btcValueElement.textContent = `BTC: $${dataBtc.bitcoin.usd.toFixed(2)}`;
            ethValueElement.textContent = `ETH: $${dataEth.ethereum.usd.toFixed(2)}`;
            astarValueElement.textContent = `Astar: $${dataAstar.astar.usd.toFixed(2)}`;
        } catch (error) {
            console.error('Erro ao buscar valores das criptomoedas:', error);
            btcValueElement.textContent = 'Erro ao buscar BTC';
            ethValueElement.textContent = 'Erro ao buscar ETH';
            astarValueElement.textContent = 'Erro ao buscar Astar';
        }
    }

    function showPortfolio() {
        portfolioSection.classList.remove('hidden');
        fetchCryptoValues(); // Atualiza os valores das criptomoedas quando o portfolio é exibido
    }

    // Adiciona um ouvinte de evento para o botão de conectar MetaMask
    connectButton.addEventListener('click', connectMetaMask);

    // Adiciona um ouvinte de evento para a seção do menu
    portfolioLink.addEventListener('click', showPortfolio);
});
