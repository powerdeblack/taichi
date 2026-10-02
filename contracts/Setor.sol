// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Guerra Sideral — Setor
/// @notice Registro on-chain dos comandantes do setor: check-in diário (retenção) e marcos de Monólitos de Domínio.
/// @dev Não guarda valor: serve para atividade verificável dos jogadores. Combate e território autoritativos
///      ficam no servidor do jogo (fase 2).
contract Setor {
    uint16 public constant TAMANHO_MAPA = 40;
    uint8 public constant MAX_MONOLITOS = 15;

    struct Jogador {
        string nome;
        uint32 ultimoDia;
        uint32 sequencia;
        uint32 totalCheckIns;
        uint64 registradoEm;
        uint8 monolitos;
    }

    mapping(address => Jogador) public jogadores;
    address[] public listaJogadores;
    mapping(uint32 => address) public monolitoEm; // chave = x * TAMANHO_MAPA + y

    event JogadorRegistrado(address indexed jogador, string nome);
    event CheckIn(address indexed jogador, uint32 dia, uint32 sequencia);
    event MonolitoAncorado(address indexed jogador, uint16 x, uint16 y);
    event MonolitoRemovido(address indexed jogador, uint16 x, uint16 y);

    error NomeInvalido();
    error NaoRegistrado();
    error JaRegistrado();
    error CheckInJaFeito();
    error CoordenadaInvalida();
    error CoordenadaOcupada();
    error LimiteDeMonolitos();
    error NaoEDono();

    function registrar(string calldata nome) external {
        if (jogadores[msg.sender].registradoEm != 0) revert JaRegistrado();
        uint256 n = bytes(nome).length;
        if (n == 0 || n > 24) revert NomeInvalido();
        jogadores[msg.sender].nome = nome;
        jogadores[msg.sender].registradoEm = uint64(block.timestamp);
        listaJogadores.push(msg.sender);
        emit JogadorRegistrado(msg.sender, nome);
    }

    function diaAtual() public view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    /// @notice Um check-in por dia (UTC). Dias seguidos aumentam a sequência; pular um dia reinicia.
    function checkIn() external {
        Jogador storage j = _registrado(msg.sender);
        uint32 hoje = diaAtual();
        if (hoje <= j.ultimoDia) revert CheckInJaFeito();
        j.sequencia = (j.ultimoDia != 0 && hoje == j.ultimoDia + 1) ? j.sequencia + 1 : 1;
        j.ultimoDia = hoje;
        j.totalCheckIns++;
        emit CheckIn(msg.sender, hoje, j.sequencia);
    }

    function ancorarMonolito(uint16 x, uint16 y) external {
        Jogador storage j = _registrado(msg.sender);
        if (x >= TAMANHO_MAPA || y >= TAMANHO_MAPA) revert CoordenadaInvalida();
        uint32 chave = uint32(x) * TAMANHO_MAPA + y;
        if (monolitoEm[chave] != address(0)) revert CoordenadaOcupada();
        if (j.monolitos >= MAX_MONOLITOS) revert LimiteDeMonolitos();
        monolitoEm[chave] = msg.sender;
        j.monolitos++;
        emit MonolitoAncorado(msg.sender, x, y);
    }

    function removerMonolito(uint16 x, uint16 y) external {
        uint32 chave = uint32(x) * TAMANHO_MAPA + y;
        if (monolitoEm[chave] != msg.sender) revert NaoEDono();
        delete monolitoEm[chave];
        jogadores[msg.sender].monolitos--;
        emit MonolitoRemovido(msg.sender, x, y);
    }

    function totalJogadores() external view returns (uint256) {
        return listaJogadores.length;
    }

    function _registrado(address conta) private view returns (Jogador storage j) {
        j = jogadores[conta];
        if (j.registradoEm == 0) revert NaoRegistrado();
    }
}
