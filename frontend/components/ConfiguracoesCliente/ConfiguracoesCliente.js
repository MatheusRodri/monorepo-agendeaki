'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AlternadorTema from '../AlternadorTema/AlternadorTema';
import { limparSessao, lerRespostaApi, obterTokenAcesso, obterUrlApi } from '../../utils/respostaApi';

export default function ConfiguracoesCliente() {
  const roteador = useRouter();
  const [confirmacao, definirConfirmacao] = useState('');
  const [mensagem, definirMensagem] = useState('');
  const [excluindo, definirExcluindo] = useState(false);
  const podeExcluir = confirmacao === 'EXCLUIR MINHA CONTA';

  async function excluirConta() {
    if (!podeExcluir || !window.confirm('Esta ação é irreversível. Deseja excluir sua conta e todos os seus agendamentos?')) return;

    definirExcluindo(true);
    definirMensagem('');
    try {
      const tokenAcesso = obterTokenAcesso();
      const resposta = await fetch(`${obterUrlApi()}/api/clientes/conta`, {
        method: 'DELETE',
        headers: tokenAcesso ? { Authorization: `Bearer ${tokenAcesso}` } : {},
      });
      const { dados, mensagem: mensagemResposta } = await lerRespostaApi(resposta);
      if (!resposta.ok) throw new Error(dados.mensagem ?? mensagemResposta ?? 'Não foi possível excluir a conta.');

      limparSessao();
      roteador.replace('/');
    } catch (erro) {
      definirMensagem(erro.message);
      definirExcluindo(false);
    }
  }

  return (
    <main className="pagina-configuracoes-cliente">
      <header className="cabecalho-area"><Link aria-label="AgendeAki: página inicial" className="marca" href="/"><span aria-hidden="true" className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><nav aria-label="Navegação do cliente"><Link href="/cliente/inicio">Explorar</Link><Link href="/cliente/agendamentos">Agendamentos</Link><Link className="navegacao-area__ativo" href="/cliente/configuracoes">Configurações</Link></nav><AlternadorTema /></header>
      <section className="conteudo-configuracoes-cliente conteudo-limitado"><p className="sobretitulo">Configurações</p><h1>Sua conta.</h1><section className="zona-perigo"><div><strong>Excluir conta permanentemente</strong><p>Isso remove seus agendamentos, pagamentos associados e o acesso à conta. Não é possível desfazer.</p></div><label className="campo-formulario"><span>Digite <b>EXCLUIR MINHA CONTA</b> para confirmar</span><input disabled={excluindo} onChange={(evento) => definirConfirmacao(evento.target.value)} value={confirmacao} /></label>{mensagem && <p className="mensagem-formulario mensagem-formulario--erro">{mensagem}</p>}<button className="botao-perigo" disabled={!podeExcluir || excluindo} onClick={excluirConta} type="button">{excluindo ? 'Excluindo conta...' : 'Excluir minha conta'}</button></section></section>
    </main>
  );
}
