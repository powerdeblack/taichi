const { expect } = require('chai');
const { ethers } = require('hardhat');

const PRECO_NAVE = ethers.parseEther('5');
const PRECO_SINAL = ethers.parseEther('1');
const DIA = 24 * 3600;

async function avancar(segundos) {
  await ethers.provider.send('evm_increaseTime', [segundos]);
  await ethers.provider.send('evm_mine', []);
}

describe('NaveCidade', () => {
  let nave, admin, jogador, outro, tesouraria;

  beforeEach(async () => {
    [admin, jogador, outro, tesouraria] = await ethers.getSigners();
    nave = await ethers.deployContract('NaveCidade', [admin.address, tesouraria.address, PRECO_NAVE]);
  });

  it('primeira nave grátis, segunda paga e vai para a tesouraria', async () => {
    await expect(nave.connect(jogador).criarNave('Kaiju One')).to.emit(nave, 'NaveCriada').withArgs(1n, jogador.address, 'Kaiju One', 0n);
    expect(await nave.precoPara(jogador.address)).to.equal(PRECO_NAVE);
    await expect(nave.connect(jogador).criarNave('Segunda')).to.be.revertedWithCustomError(nave, 'ValorIncorreto');
    const antes = await ethers.provider.getBalance(tesouraria.address);
    await nave.connect(jogador).criarNave('Segunda', { value: PRECO_NAVE });
    expect(await ethers.provider.getBalance(tesouraria.address)).to.equal(antes + PRECO_NAVE);
    expect(await nave.navesDe(jogador.address)).to.deep.equal([1n, 2n]);
  });

  it('rejeita nomes que quebrariam os metadados', async () => {
    await expect(nave.connect(jogador).criarNave('a"b')).to.be.revertedWithCustomError(nave, 'NomeInvalido');
    await expect(nave.connect(jogador).criarNave('')).to.be.revertedWithCustomError(nave, 'NomeInvalido');
  });

  it('nível só muda pelo OPERADOR e nunca diminui', async () => {
    await nave.connect(jogador).criarNave('Kaiju');
    await expect(nave.connect(jogador).atualizarNivel(1, 5)).to.be.revertedWithCustomError(nave, 'AccessControlUnauthorizedAccount');
    await nave.grantRole(await nave.OPERADOR(), admin.address);
    await nave.atualizarNivel(1, 5);
    await expect(nave.atualizarNivel(1, 4)).to.be.revertedWithCustomError(nave, 'NivelInvalido');
    expect((await nave.dados(1)).nivelComando).to.equal(5n);
  });

  it('só o dono renomeia; ninguém toma a nave de outro', async () => {
    await nave.connect(jogador).criarNave('Kaiju');
    await expect(nave.connect(outro).renomear(1, 'Roubada')).to.be.revertedWithCustomError(nave, 'NaoEDono');
    await expect(nave.connect(outro).transferFrom(jogador.address, outro.address, 1)).to.be.reverted;
  });

  it('tokenURI tem JSON on-chain com o nível', async () => {
    await nave.connect(jogador).criarNave('Kaiju');
    const uri = await nave.tokenURI(1);
    const json = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
    expect(json.name).to.equal('Kaiju #1');
    expect(json.attributes[0]).to.deep.equal({ trait_type: 'Centro de Comando', value: 1 });
  });
});

describe('Comandantes', () => {
  let cmd, admin, jogador, tesouraria;

  beforeEach(async () => {
    [admin, jogador, , tesouraria] = await ethers.getSigners();
    cmd = await ethers.deployContract('Comandantes', [admin.address, tesouraria.address, PRECO_SINAL, 'https://exemplo/']);
  });

  it('abrir sinais cunha fragmentos e paga a tesouraria', async () => {
    const antes = await ethers.provider.getBalance(tesouraria.address);
    await expect(cmd.connect(jogador).abrirSinal(3, { value: PRECO_SINAL })).to.be.revertedWithCustomError(cmd, 'ValorIncorreto');
    await cmd.connect(jogador).abrirSinal(3, { value: PRECO_SINAL * 3n });
    expect(await ethers.provider.getBalance(tesouraria.address)).to.equal(antes + PRECO_SINAL * 3n);
    let total = 0n;
    for (const id of [1, 2, 3, 4, 5, 6, 101, 102]) total += await cmd.balanceOf(jogador.address, id);
    expect(total >= 6n && total <= 12n).to.equal(true);
  });

  it('forjar queima fragmentos próprios e depois universais', async () => {
    await cmd.grantRole(await cmd.OPERADOR(), admin.address);
    await cmd.cunhar(jogador.address, 3, 6); // Vega (épico, custa 10)
    await expect(cmd.connect(jogador).forjar(3)).to.be.revertedWithCustomError(cmd, 'FragmentosInsuficientes');
    await cmd.cunhar(jogador.address, 101, 5);
    await expect(cmd.connect(jogador).forjar(3)).to.emit(cmd, 'ComandanteForjado');
    expect(await cmd.balanceOf(jogador.address, 3)).to.equal(0n);
    expect(await cmd.balanceOf(jogador.address, 101)).to.equal(1n);
    expect(await cmd.estrelas(jogador.address, 3)).to.equal(1n);
    await expect(cmd.connect(jogador).forjar(3)).to.be.revertedWithCustomError(cmd, 'JaDesbloqueado');
  });

  it('estrelas custam mais a cada nível e param em 5', async () => {
    await cmd.grantRole(await cmd.OPERADOR(), admin.address);
    await cmd.cunhar(jogador.address, 2, 10 + 5 + 10 + 15 + 20);
    await cmd.connect(jogador).forjar(2);
    for (let i = 0; i < 4; i++) await cmd.connect(jogador).evoluirEstrela(2);
    expect((await cmd.estrelasDe(jogador.address))[1]).to.equal(5n);
    await expect(cmd.connect(jogador).evoluirEstrela(2)).to.be.revertedWithCustomError(cmd, 'EstrelasNoMaximo');
  });

  it('só o OPERADOR cunha recompensas', async () => {
    await expect(cmd.connect(jogador).cunhar(jogador.address, 1, 100)).to.be.revertedWithCustomError(cmd, 'AccessControlUnauthorizedAccount');
  });
});

describe('Setor', () => {
  let setor, jogador, outro;

  beforeEach(async () => {
    [, jogador, outro] = await ethers.getSigners();
    setor = await ethers.deployContract('Setor');
  });

  it('check-in diário com sequência', async () => {
    await expect(setor.connect(jogador).checkIn()).to.be.revertedWithCustomError(setor, 'NaoRegistrado');
    await setor.connect(jogador).registrar('Kaito');
    await setor.connect(jogador).checkIn();
    await expect(setor.connect(jogador).checkIn()).to.be.revertedWithCustomError(setor, 'CheckInJaFeito');
    await avancar(DIA);
    await setor.connect(jogador).checkIn();
    expect((await setor.jogadores(jogador.address)).sequencia).to.equal(2n);
    await avancar(3 * DIA);
    await setor.connect(jogador).checkIn();
    expect((await setor.jogadores(jogador.address)).sequencia).to.equal(1n);
    expect((await setor.jogadores(jogador.address)).totalCheckIns).to.equal(3n);
  });

  it('Monólitos: coordenada única, só o dono remove', async () => {
    await setor.connect(jogador).registrar('Kaito');
    await setor.connect(outro).registrar('Nyx');
    await expect(setor.connect(jogador).ancorarMonolito(5, 22)).to.emit(setor, 'MonolitoAncorado');
    await expect(setor.connect(outro).ancorarMonolito(5, 22)).to.be.revertedWithCustomError(setor, 'CoordenadaOcupada');
    await expect(setor.connect(jogador).ancorarMonolito(40, 0)).to.be.revertedWithCustomError(setor, 'CoordenadaInvalida');
    await expect(setor.connect(outro).removerMonolito(5, 22)).to.be.revertedWithCustomError(setor, 'NaoEDono');
    await setor.connect(jogador).removerMonolito(5, 22);
    expect((await setor.jogadores(jogador.address)).monolitos).to.equal(0n);
  });
});
