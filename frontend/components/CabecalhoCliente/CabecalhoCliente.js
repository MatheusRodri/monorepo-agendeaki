'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AlternadorTema from '../AlternadorTema/AlternadorTema';
import { requisitarApi } from '../../utils/api';
import { obterTokenAcesso } from '../../utils/respostaApi';

const navegacao = [['inicio', 'Explorar', '/cliente/inicio'], ['agendamentos', 'Agendamentos', '/cliente/agendamentos'], ['configuracoes', 'Configurações', '/cliente/configuracoes']];

export default function CabecalhoCliente({ secao }) {
  const [nome, definirNome] = useState('cliente');
  useEffect(() => {
    const token = obterTokenAcesso();
    if (!token) return;
    requisitarApi('/api/clientes/perfil')
      .then((dados) => { if (dados.perfil?.nome) definirNome(dados.perfil.nome.split(' ')[0]); }).catch(() => {});
  }, []);
  return <><header className="cabecalho-area cabecalho-cliente"><Link aria-label="AgendeAki: página inicial" className="marca" href="/"><span aria-hidden="true" className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><p className="titulo-area-cliente">Olá, {nome}</p><AlternadorTema /></header><nav aria-label="Navegação do cliente" className="menu-cliente">{navegacao.map(([chave, titulo, caminho]) => <Link className={secao === chave ? 'menu-cliente__ativo' : ''} href={caminho} key={chave}>{titulo}</Link>)}</nav></>;
}
