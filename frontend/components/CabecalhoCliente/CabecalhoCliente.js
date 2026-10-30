'use client';

import { encerrarSessaoPerfil } from '../../utils/notificacoesDispositivo';
import { toastAviso } from '../../utils/toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { requisitarApi } from '../../utils/api';
import { obterTokenAcesso } from '../../utils/respostaApi';

const navegacao = [['inicio', 'Explorar', '/cliente/inicio'], ['agendamentos', 'Agendamentos', '/cliente/agendamentos'], ['notificacoes', 'Notificações', '/cliente/notificacoes'], ['configuracoes', 'Configurações', '/cliente/configuracoes']];

export default function CabecalhoCliente({ secao }) {
  const roteador = useRouter();
  const [nome, definirNome] = useState('cliente');
  const [saindo, definirSaindo] = useState(false);
  const [notificacoesNaoLidas, definirNotificacoesNaoLidas] = useState(0);
  useEffect(() => {
    const token = obterTokenAcesso('cliente');
    if (!token) return;
    requisitarApi('/api/clientes/perfil')
      .then((dados) => { if (dados.perfil?.nome) definirNome(dados.perfil.nome.split(' ')[0]); }).catch(() => {});
    let ativo = true;
    const carregarContagem = () => requisitarApi('/api/clientes/notificacoes')
      .then((dados) => { if (ativo) definirNotificacoesNaoLidas(Number(dados.naoLidas ?? 0)); })
      .catch(() => {});
    carregarContagem();
    const intervalo = window.setInterval(carregarContagem, 30000);
    return () => { ativo = false; window.clearInterval(intervalo); };
  }, []);

  async function sair() {
    if (saindo) return;
    definirSaindo(true);
    if (!await encerrarSessaoPerfil('cliente')) toastAviso('Você saiu deste dispositivo. O encerramento no servidor não foi confirmado.');
    roteador.replace('/cliente');
  }

  return <><header className="cabecalho-area cabecalho-cliente"><Link className="marca" href="/"><span aria-hidden="true" className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><p className="titulo-area-cliente">Olá, {nome}</p><div className="cabecalho-cliente__acoes"><span data-alternador-tema-destino /><button className="botao-secundario botao-sair-area" disabled={saindo} onClick={sair} type="button">{saindo ? 'Saindo...' : 'Sair'}</button></div></header><nav aria-label="Navegação do cliente" className="menu-cliente">{navegacao.map(([chave, titulo, caminho]) => <Link className={secao === chave ? 'menu-cliente__ativo' : ''} href={caminho} key={chave}>{titulo}{chave === 'notificacoes' && notificacoesNaoLidas > 0 && <span aria-label={`${notificacoesNaoLidas} não lidas`} className="menu-cliente__contador">{notificacoesNaoLidas > 99 ? '99+' : notificacoesNaoLidas}</span>}</Link>)}</nav></>;
}
