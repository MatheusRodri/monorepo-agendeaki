'use client';

import { useEffect, useState } from 'react';
import CabecalhoCliente from '../CabecalhoCliente/CabecalhoCliente';
import CampoSenha from '../CampoSenha/CampoSenha';
import GerenciarNotificacoesCliente from '../GerenciarNotificacoesCliente/GerenciarNotificacoesCliente';
import { dataParaExibicao, dataParaIso, formatarData, formatarTelefone } from '../../utils/formatadores';
import { requisitarApi } from '../../utils/api';
import { desativarNotificacoes } from '../../utils/notificacoesDispositivo';
import { limparSessao } from '../../utils/respostaApi';
import { toastErro, toastSucesso } from '../../utils/toast';

export default function ConfiguracoesCliente() {
  const [perfil, definirPerfil] = useState({ nome: '', telefone: '', dataNascimento: '' });
  const [senha, definirSenha] = useState({ senha: '', confirmacaoSenha: '' });
  const [confirmacao, definirConfirmacao] = useState('');
  const [excluindo, definirExcluindo] = useState(false);
  async function requisitar(caminho, opcoes = {}) {
    return requisitarApi(`/api/clientes${caminho}`, {
      dados: opcoes.body ? JSON.parse(opcoes.body) : undefined,
      metodo: opcoes.method,
    });
  }

  useEffect(() => { requisitar('/perfil').then(({ perfil: dados }) => definirPerfil({ nome: dados.nome, telefone: formatarTelefone(dados.telefone), dataNascimento: dataParaExibicao(dados.dataNascimento) })).catch((erro) => toastErro(erro.message)); }, []);

  async function salvarInformacoes(evento) {
    evento.preventDefault();
    try { const resultado = await requisitar('/perfil', { method: 'PATCH', body: JSON.stringify({ nome: perfil.nome, telefone: perfil.telefone, dataNascimento: dataParaIso(perfil.dataNascimento) }) }); toastSucesso(resultado.mensagem); } catch (erro) { toastErro(erro.message); }
  }

  async function salvarSenha(evento) {
    evento.preventDefault();
    try { const resultado = await requisitar('/senha', { method: 'PATCH', body: JSON.stringify(senha) }); toastSucesso(resultado.mensagem); definirSenha({ senha: '', confirmacaoSenha: '' }); } catch (erro) { toastErro(erro.message); }
  }

  async function excluirConta() {
    if (confirmacao !== 'EXCLUIR MINHA CONTA' || !window.confirm('Esta ação é irreversível. Deseja excluir sua conta e todos os seus agendamentos?')) return;
    definirExcluindo(true);
    try { await requisitar('/conta', { method: 'DELETE' }); await desativarNotificacoes('cliente').catch(() => {}); limparSessao('cliente'); window.location.assign('/'); } catch (erro) { toastErro(erro.message); definirExcluindo(false); }
  }

  return <main className="pagina-configuracoes-cliente"><CabecalhoCliente secao="configuracoes" /><section className="conteudo-configuracoes-cliente conteudo-limitado"><p className="sobretitulo">Configurações</p><h1>Sua conta.</h1><section className="secao-configuracoes"><h2>Informações da conta</h2><form className="grade-formulario" onSubmit={salvarInformacoes}><label className="campo-formulario"><span>Nome</span><input onChange={(evento) => definirPerfil({ ...perfil, nome: evento.target.value })} required value={perfil.nome} /></label><label className="campo-formulario"><span>Telefone</span><input autoComplete="tel" inputMode="numeric" onChange={(evento) => definirPerfil({ ...perfil, telefone: formatarTelefone(evento.target.value) })} placeholder="(00) 00000-0000" required value={perfil.telefone} /></label><label className="campo-formulario"><span>Data de nascimento</span><input inputMode="numeric" maxLength="10" onChange={(evento) => definirPerfil({ ...perfil, dataNascimento: formatarData(evento.target.value) })} placeholder="DD/MM/AAAA" required value={perfil.dataNascimento} /></label><button className="botao-enviar" type="submit">Salvar informações →</button></form></section><section className="secao-configuracoes"><h2>Notificações</h2><GerenciarNotificacoesCliente /></section><section className="secao-configuracoes"><h2>Alterar senha</h2><form className="grade-formulario" onSubmit={salvarSenha}><CampoSenha aoMudar={(evento) => definirSenha({ ...senha, senha: evento.target.value })} autoComplete="new-password" id="novaSenha" nome="novaSenha" rotulo="Nova senha" valor={senha.senha} /><CampoSenha aoMudar={(evento) => definirSenha({ ...senha, confirmacaoSenha: evento.target.value })} autoComplete="new-password" id="confirmacaoNovaSenha" nome="confirmacaoNovaSenha" rotulo="Confirme a nova senha" valor={senha.confirmacaoSenha} /><button className="botao-enviar" type="submit">Alterar senha →</button></form></section><section className="zona-perigo"><div><strong>Excluir conta permanentemente</strong><p>Isso remove seus agendamentos, pagamentos associados e o acesso à conta. Não é possível desfazer.</p></div><label className="campo-formulario"><span>Digite <b>EXCLUIR MINHA CONTA</b> para confirmar</span><input disabled={excluindo} onChange={(evento) => definirConfirmacao(evento.target.value)} value={confirmacao} /></label><button className="botao-perigo" disabled={confirmacao !== 'EXCLUIR MINHA CONTA' || excluindo} onClick={excluirConta} type="button">{excluindo ? 'Excluindo conta...' : 'Excluir minha conta'}</button></section></section></main>;
}
