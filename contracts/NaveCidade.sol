// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Guerra Sideral — Nave-Cidade
/// @notice A base de cada jogador é uma Nave-Cidade ERC-721. A primeira de cada carteira é grátis (só gás);
///         as seguintes custam `precoMint` em RON. Nenhuma função permite tomar a nave de outro jogador.
/// @dev O nível do Centro de Comando só é atualizado pelo papel OPERADOR (servidor do jogo, fase 2),
///      para que ninguém infle o valor de mercado da própria nave.
contract NaveCidade is ERC721Enumerable, AccessControl {
    using Strings for uint256;

    bytes32 public constant OPERADOR = keccak256("OPERADOR");
    uint8 public constant NIVEL_MAXIMO = 25;

    struct Dados {
        string nome;
        uint8 nivelComando;
        uint64 criadaEm;
    }

    uint256 public precoMint;
    address payable public tesouraria;
    uint256 private _proximoId = 1;

    mapping(uint256 => Dados) private _dados;
    mapping(address => bool) public mintGratisUsado;

    event NaveCriada(uint256 indexed tokenId, address indexed dono, string nome, uint256 preco);
    event NaveRenomeada(uint256 indexed tokenId, string nome);
    event NivelAtualizado(uint256 indexed tokenId, uint8 nivelComando);
    event PrecoAlterado(uint256 preco);
    event TesourariaAlterada(address tesouraria);

    error NomeInvalido();
    error ValorIncorreto(uint256 esperado);
    error NaoEDono();
    error NivelInvalido();
    error FalhaNoPagamento();

    constructor(address admin, address payable tesouraria_, uint256 precoMint_) ERC721("Guerra Sideral: Nave-Cidade", "NAVE") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        tesouraria = tesouraria_;
        precoMint = precoMint_;
    }

    function precoPara(address conta) public view returns (uint256) {
        return mintGratisUsado[conta] ? precoMint : 0;
    }

    function criarNave(string calldata nome) external payable returns (uint256 tokenId) {
        _validarNome(nome);
        uint256 preco = precoPara(msg.sender);
        if (msg.value != preco) revert ValorIncorreto(preco);
        mintGratisUsado[msg.sender] = true;

        tokenId = _proximoId++;
        _dados[tokenId] = Dados({nome: nome, nivelComando: 1, criadaEm: uint64(block.timestamp)});
        _safeMint(msg.sender, tokenId);
        emit NaveCriada(tokenId, msg.sender, nome, preco);

        if (preco > 0) {
            (bool ok,) = tesouraria.call{value: preco}("");
            if (!ok) revert FalhaNoPagamento();
        }
    }

    function renomear(uint256 tokenId, string calldata nome) external {
        if (ownerOf(tokenId) != msg.sender) revert NaoEDono();
        _validarNome(nome);
        _dados[tokenId].nome = nome;
        emit NaveRenomeada(tokenId, nome);
    }

    /// @notice Chamado pelo servidor do jogo quando o Centro de Comando evolui. O nível nunca diminui.
    function atualizarNivel(uint256 tokenId, uint8 nivel) external onlyRole(OPERADOR) {
        _requireOwned(tokenId);
        if (nivel <= _dados[tokenId].nivelComando || nivel > NIVEL_MAXIMO) revert NivelInvalido();
        _dados[tokenId].nivelComando = nivel;
        emit NivelAtualizado(tokenId, nivel);
    }

    function dados(uint256 tokenId) external view returns (Dados memory) {
        _requireOwned(tokenId);
        return _dados[tokenId];
    }

    function navesDe(address dono) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(dono);
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) ids[i] = tokenOfOwnerByIndex(dono, i);
    }

    // ----- administração -----

    function definirPreco(uint256 preco) external onlyRole(DEFAULT_ADMIN_ROLE) {
        precoMint = preco;
        emit PrecoAlterado(preco);
    }

    function definirTesouraria(address payable nova) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tesouraria = nova;
        emit TesourariaAlterada(nova);
    }

    // ----- metadados on-chain (lidos por marketplaces como o Mavis Market) -----

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Dados memory d = _dados[tokenId];
        string memory nivel = uint256(d.nivelComando).toString();
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><rect width="320" height="320" fill="#05060f"/>',
            '<circle cx="60" cy="50" r="1.5" fill="#fff"/><circle cx="250" cy="90" r="1" fill="#fff"/><circle cx="200" cy="260" r="1.2" fill="#fff"/>',
            '<ellipse cx="160" cy="165" rx="95" ry="30" fill="#1b2a4a" stroke="#38d9a9" stroke-width="3"/>',
            '<rect x="125" y="120" width="70" height="40" rx="10" fill="#22365e" stroke="#38d9a9" stroke-width="2"/>',
            '<text x="160" y="240" fill="#e6f1ff" font-family="monospace" font-size="16" text-anchor="middle">Centro de Comando ', nivel, "</text>",
            '<text x="160" y="290" fill="#7f8fb3" font-family="monospace" font-size="12" text-anchor="middle">#', tokenId.toString(), "</text></svg>"
        );
        string memory json = string.concat(
            '{"name":"', d.nome, " #", tokenId.toString(),
            '","description":"Nave-Cidade do jogo Guerra Sideral na Ronin.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"Centro de Comando","value":', nivel,
            '},{"display_type":"date","trait_type":"Criada em","value":', uint256(d.criadaEm).toString(), "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // Aceita só letras, números, espaço, hífen e sublinhado (evita quebrar o JSON dos metadados).
    function _validarNome(string calldata nome) private pure {
        bytes calldata b = bytes(nome);
        if (b.length == 0 || b.length > 24) revert NomeInvalido();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool valido = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || c == 0x20 || c == 0x2D || c == 0x5F;
            if (!valido) revert NomeInvalido();
        }
    }
}
