// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Guerra Sideral — Comandantes (semi-NFT)
/// @notice Cada comandante é um ID ERC-1155; cada unidade é um Fragmento (como as esculturas do Rise of Kingdoms).
///         Juntar fragmentos permite "forjar" (desbloquear) o comandante e subir suas estrelas, queimando os fragmentos.
///         Fragmentos são negociáveis em marketplaces.
/// @dev IDs 1..6 = comandantes; 101 = Fragmento Universal Épico; 102 = Fragmento Universal Lendário.
///      `abrirSinal` usa pseudo-aleatoriedade on-chain, adequada só para testnet; em mainnet deve usar o Ronin VRF.
contract Comandantes is ERC1155, AccessControl {
    using Strings for uint256;

    bytes32 public constant OPERADOR = keccak256("OPERADOR");

    uint256 public constant UNIVERSAL_EPICO = 101;
    uint256 public constant UNIVERSAL_LENDARIO = 102;
    uint8 public constant EPICO = 1;
    uint8 public constant LENDARIO = 2;
    uint8 public constant MAX_ESTRELAS = 5;
    uint256 public constant MAX_SINAIS_POR_TX = 10;

    uint256 public precoSinal;
    address payable public tesouraria;
    string public baseUri;
    uint256 private _nonce;

    mapping(uint256 => uint8) public raridade;
    uint256[] private _lendarios;
    uint256[] private _epicos;

    mapping(address => mapping(uint256 => uint8)) public estrelas; // 0 = bloqueado

    event SinalAberto(address indexed jogador, uint256 indexed id, uint256 quantidade);
    event ComandanteForjado(address indexed jogador, uint256 indexed id);
    event EstrelaEvoluida(address indexed jogador, uint256 indexed id, uint8 estrelas);

    error ValorIncorreto(uint256 esperado);
    error QuantidadeInvalida();
    error ComandanteInvalido();
    error JaDesbloqueado();
    error Bloqueado();
    error EstrelasNoMaximo();
    error FragmentosInsuficientes(uint256 necessario);
    error FalhaNoPagamento();

    constructor(address admin, address payable tesouraria_, uint256 precoSinal_, string memory baseUri_) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        tesouraria = tesouraria_;
        precoSinal = precoSinal_;
        baseUri = baseUri_;
        // Mesma ordem de src/data.js (tokenId).
        _registrar(1, LENDARIO); // Kaito
        _registrar(2, EPICO); // Orion
        _registrar(3, EPICO); // Vega
        _registrar(4, EPICO); // Mira
        _registrar(5, LENDARIO); // Nyx
        _registrar(6, LENDARIO); // Ryu
    }

    function _registrar(uint256 id, uint8 r) private {
        raridade[id] = r;
        if (r == LENDARIO) _lendarios.push(id);
        else _epicos.push(id);
    }

    function custoDesbloqueio(uint256 id) public view returns (uint256) {
        return raridade[id] == LENDARIO ? 20 : 10;
    }

    function custoEstrela(uint256 id, uint8 estrelasAtuais) public view returns (uint256) {
        return (raridade[id] == LENDARIO ? 10 : 5) * uint256(estrelasAtuais);
    }

    function universalDe(uint256 id) public view returns (uint256) {
        return raridade[id] == LENDARIO ? UNIVERSAL_LENDARIO : UNIVERSAL_EPICO;
    }

    /// @notice Abre Sinais de Recrutamento pagando em RON. Cada sinal dá de 2 a 4 fragmentos.
    function abrirSinal(uint256 quantidade) external payable {
        if (quantidade == 0 || quantidade > MAX_SINAIS_POR_TX) revert QuantidadeInvalida();
        uint256 esperado = precoSinal * quantidade;
        if (msg.value != esperado) revert ValorIncorreto(esperado);
        for (uint256 i = 0; i < quantidade; i++) {
            uint256 r = uint256(keccak256(abi.encode(block.prevrandao, msg.sender, _nonce++)));
            uint256 qtd = 2 + (r % 3);
            uint256 id;
            if ((r >> 8) % 10 == 0) {
                id = (r >> 16) % 4 == 0 ? UNIVERSAL_LENDARIO : UNIVERSAL_EPICO;
            } else if ((r >> 24) % 100 < 20) {
                id = _lendarios[(r >> 32) % _lendarios.length];
            } else {
                id = _epicos[(r >> 32) % _epicos.length];
            }
            _mint(msg.sender, id, qtd, "");
            emit SinalAberto(msg.sender, id, qtd);
        }
        if (esperado > 0) {
            (bool ok,) = tesouraria.call{value: esperado}("");
            if (!ok) revert FalhaNoPagamento();
        }
    }

    /// @notice Desbloqueia o comandante queimando fragmentos (próprios primeiro, depois universais).
    function forjar(uint256 id) external {
        if (raridade[id] == 0) revert ComandanteInvalido();
        if (estrelas[msg.sender][id] != 0) revert JaDesbloqueado();
        _queimar(msg.sender, id, custoDesbloqueio(id));
        estrelas[msg.sender][id] = 1;
        emit ComandanteForjado(msg.sender, id);
    }

    function evoluirEstrela(uint256 id) external {
        uint8 atual = estrelas[msg.sender][id];
        if (atual == 0) revert Bloqueado();
        if (atual >= MAX_ESTRELAS) revert EstrelasNoMaximo();
        _queimar(msg.sender, id, custoEstrela(id, atual));
        estrelas[msg.sender][id] = atual + 1;
        emit EstrelaEvoluida(msg.sender, id, atual + 1);
    }

    /// @notice Estrelas de todos os comandantes de uma carteira (0 = bloqueado), na ordem dos IDs 1..6.
    function estrelasDe(address jogador) external view returns (uint8[6] memory r) {
        for (uint256 i = 0; i < 6; i++) r[i] = estrelas[jogador][i + 1];
    }

    function _queimar(address conta, uint256 id, uint256 custo) private {
        uint256 proprios = balanceOf(conta, id);
        uint256 universal = universalDe(id);
        if (proprios + balanceOf(conta, universal) < custo) revert FragmentosInsuficientes(custo);
        uint256 usarProprios = proprios < custo ? proprios : custo;
        if (usarProprios > 0) _burn(conta, id, usarProprios);
        if (custo > usarProprios) _burn(conta, universal, custo - usarProprios);
    }

    // ----- recompensas do servidor (fase 2) e administração -----

    function cunhar(address para, uint256 id, uint256 quantidade) external onlyRole(OPERADOR) {
        if (raridade[id] == 0 && id != UNIVERSAL_EPICO && id != UNIVERSAL_LENDARIO) revert ComandanteInvalido();
        _mint(para, id, quantidade, "");
    }

    function definirPrecoSinal(uint256 preco) external onlyRole(DEFAULT_ADMIN_ROLE) {
        precoSinal = preco;
    }

    function definirTesouraria(address payable nova) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tesouraria = nova;
    }

    function definirBaseUri(string calldata novo) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseUri = novo;
    }

    function uri(uint256 id) public view override returns (string memory) {
        return string.concat(baseUri, id.toString(), ".json");
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
