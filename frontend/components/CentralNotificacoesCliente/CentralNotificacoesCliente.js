'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import CabecalhoCliente from '../CabecalhoCliente/CabecalhoCliente';
import { requisitarApi } from '../../utils/api';
import { toastErro } from '../../utils/toast';

export default function CentralNotificacoesCliente() {
  const roteador = useRouter();
  const [notificacoes, definirNotificacoes] = useState([]);
  const [naoLidas, definirNaoLidas] = useState(0);
  const [carregando, definirCarregando] = useState(true);
  const [processando, definirProcessando] = useState(false);

  async function carregarNotificacoes() {
    try {
      const dados = await requisitarApi('/api/clientes/notificacoes');
      definirNotificacoes(dados.notificacoes ?? []);
      definirNaoLidas(Number(dados.naoLidas ?? 0));
    } catch (erro) {
      toastErro(erro.message);
    } finally {
      definirCarregando(false);
    }
  }

  useEffect(() => {
    carregarNotificacoes();
    const intervalo = window.setInterval(carregarNotificacoes, 20000);
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregarNotificacoes(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  async function marcarTodasComoLidas() {
    definirProcessando(true);
    try {
      await requisitarApi('/api/clientes/notificacoes/lidas', { metodo: 'POST' });
      definirNotificacoes((atuais) => atuais.map((item) => ({ ...item, lida: true })));
      definirNaoLidas(0);
    } catch (erro) { toastErro(erro.message); }
    finally { definirProcessando(false); }
  }

  async function abrirNotificacao(notificacao) {
    definirProcessando(true);
    try {
      if (!notificacao.lida) {
        try {
          await requisitarApi(`/api/clientes/notificacoes/${notificacao.id}/lida`, { metodo: 'PATCH' });
          definirNotificacoes((atuais) => atuais.map((item) => Number(item.id) === Number(notificacao.id) ? { ...item, lida: true } : item));
          definirNaoLidas((quantidade) => Math.max(0, quantidade - 1));
        } catch (erro) { toastErro(erro.message); }
      }
      roteador.push(notificacao.link || `/cliente/agendamentos?avaliar=${notificacao.idAgendamento}`);
    }
    finally { definirProcessando(false); }
  }

  return <main className="pagina-agendamentos">
    <CabecalhoCliente secao="notificacoes" />
    <section className="conteudo-agendamentos conteudo-limitado">
      <p className="sobretitulo">Sua conta</p>
      <h1 className="central-notificacoes__titulo">Notificações.</h1>
      <p className="central-notificacoes__ajuda">Para receber avisos mesmo com o app fechado, <Link href="/cliente/configuracoes">ative as notificações nas configurações</Link>.</p>
      <div className="central-notificacoes__cabecalho">
        <p>{naoLidas ? `${naoLidas} não lida${naoLidas === 1 ? '' : 's'}` : 'Tudo em dia'}</p>
        {naoLidas > 0 && <button className="botao-secundario" disabled={processando} onClick={marcarTodasComoLidas} type="button">Marcar todas como lidas</button>}
      </div>
      {carregando && <p className="estado-lista">Carregando suas notificações...</p>}
      {!carregando && notificacoes.length > 0 && <div className="central-notificacoes__lista">
        {notificacoes.map((notificacao) => {
          const conviteAvaliacao = notificacao.tipo === 'AVALIACAO';
          const avaliada = conviteAvaliacao && Boolean(notificacao.idAvaliacao);
          return <article className={`central-notificacao${notificacao.lida ? '' : ' central-notificacao--nao-lida'}`} key={notificacao.id}>
            <span aria-hidden="true" className="central-notificacao__indicador" />
            <div>
              <strong>{notificacao.titulo}</strong>
              <p>{avaliada ? 'Você já avaliou este atendimento. Obrigado por compartilhar sua experiência.' : notificacao.mensagem}</p>
              <small>{new Date(notificacao.criadaEm).toLocaleString('pt-BR')}</small>
            </div>
            <div className="central-notificacao__acoes">
              {avaliada
                ? <Link href="/cliente/agendamentos">Ver meus agendamentos</Link>
                : <button className="botao-acao-notificacao" disabled={processando} onClick={() => abrirNotificacao(notificacao)} type="button">{conviteAvaliacao ? (notificacao.podeAvaliar ? 'Avaliar atendimento' : 'Ver agendamento') : notificacao.tipo === 'CANCELAMENTO' ? 'Ver agendamento' : 'Ver novo horário'}</button>}
            </div>
          </article>;
        })}
      </div>}
      {!carregando && !notificacoes.length && <p className="estado-lista">Avisos sobre seus agendamentos aparecerão aqui.</p>}
    </section>
  </main>;
}
