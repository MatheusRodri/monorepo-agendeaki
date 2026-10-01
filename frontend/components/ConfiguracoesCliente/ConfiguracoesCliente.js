'use client';

import { useEffect, useState } from 'react';
import CabecalhoCliente from '../CabecalhoCliente/CabecalhoCliente';
import CampoSenha from '../CampoSenha/CampoSenha';
import { dataParaExibicao, dataParaIso, formatarCpf, formatarData } from '../../utils/formatadores';
import { requisitarApi } from '../../utils/api';
import { limparSessao } from '../../utils/respostaApi';

export default function ConfiguracoesCliente() {
  const [perfil, definirPerfil] = useState({ nome: '', cpf: '', dataNascimento: '' });
  const [senha, definirSenha] = useState({ senha: '', confirmacaoSenha: '' });
  const [confirmacao, definirConfirmacao] = useState('');
  const [mensagem, definirMensagem] = useState('');
  const [tipoMensagem, definirTipoMensagem] = useState('sucesso');
  const [excluindo, definirExcluindo] = useState(false);
  async function requisitar(caminho, opcoes = {}) {
    return requisitarApi(`/api/clientes${caminho}`, {
      dados: opcoes.body ? JSON.parse(opcoes.body) : undefined,
      metodo: opcoes.method,
    });
  }

  useEffect(() => { requisitar('/perfil').then(({ perfil: dados }) => definirPerfil({ ...dados, cpf: formatarCpf(dados.cpf), dataNascimento: dataParaExibicao(dados.dataNascimento) })).catch((erro) => { definirMensagem(erro.message); definirTipoMensagem('erro'); }); }, []);

  async function salvarInformacoes(evento) {
    evento.preventDefault();
    try { const resultado = await requisitar('/perfil', { method: 'PATCH', body: JSON.stringify({ ...perfil, dataNascimento: dataParaIso(perfil.dataNascimento) }) }); definirMensagem(resultado.mensagem); definirTipoMensagem('sucesso'); } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); }
  }

  async function salvarSenha(evento) {
    evento.preventDefault();
    try { const resultado = await requisitar('/senha', { method: 'PATCH', body: JSON.stringify(senha) }); definirMensagem(resultado.mensagem); definirTipoMensagem('sucesso'); definirSenha({ senha: '', confirmacaoSenha: '' }); } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); }
  }

  async function excluirConta() {
    if (confirmacao !== 'EXCLUIR MINHA CONTA' || !window.confirm('Esta ação é irreversível. Deseja excluir sua conta e todos os seus agendamentos?')) return;
    definirExcluindo(true);
    try { await requisitar('/conta', { method: 'DELETE' }); limparSessao(); window.location.assign('/'); } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); definirExcluindo(false); }
  }

  return <main className="pagina-configuracoes-cliente"><CabecalhoCliente secao="configuracoes" /><section className="conteudo-configuracoes-cliente conteudo-limitado"><p className="sobretitulo">Configurações</p><h1>Sua conta.</h1>{mensagem && <p className={`mensagem-formulario mensagem-formulario--${tipoMensagem}`}>{mensagem}</p>}<section className="secao-configuracoes"><h2>Informações da conta</h2><form className="grade-formulario" onSubmit={salvarInformacoes}><label className="campo-formulario"><span>Nome</span><input onChange={(evento) => definirPerfil({ ...perfil, nome: evento.target.value })} required value={perfil.nome} /></label><label className="campo-formulario"><span>CPF</span><input inputMode="numeric" onChange={(evento) => definirPerfil({ ...perfil, cpf: formatarCpf(evento.target.value) })} required value={perfil.cpf} /></label><label className="campo-formulario"><span>Data de nascimento</span><input inputMode="numeric" maxLength="10" onChange={(evento) => definirPerfil({ ...perfil, dataNascimento: formatarData(evento.target.value) })} placeholder="DD/MM/AAAA" required value={perfil.dataNascimento} /></label><button className="botao-enviar" type="submit">Salvar informações →</button></form></section><section className="secao-configuracoes"><h2>Alterar senha</h2><form className="grade-formulario" onSubmit={salvarSenha}><CampoSenha aoMudar={(evento) => definirSenha({ ...senha, senha: evento.target.value })} autoComplete="new-password" id="novaSenha" nome="novaSenha" rotulo="Nova senha" valor={senha.senha} /><CampoSenha aoMudar={(evento) => definirSenha({ ...senha, confirmacaoSenha: evento.target.value })} autoComplete="new-password" id="confirmacaoNovaSenha" nome="confirmacaoNovaSenha" rotulo="Confirme a nova senha" valor={senha.confirmacaoSenha} /><button className="botao-enviar" type="submit">Alterar senha →</button></form></section><section className="zona-perigo"><div><strong>Excluir conta permanentemente</strong><p>Isso remove seus agendamentos, pagamentos associados e o acesso à conta. Não é possível desfazer.</p></div><label className="campo-formulario"><span>Digite <b>EXCLUIR MINHA CONTA</b> para confirmar</span><input disabled={excluindo} onChange={(evento) => definirConfirmacao(evento.target.value)} value={confirmacao} /></label><button className="botao-perigo" disabled={confirmacao !== 'EXCLUIR MINHA CONTA' || excluindo} onClick={excluirConta} type="button">{excluindo ? 'Excluindo conta...' : 'Excluir minha conta'}</button></section></section></main>;
}
