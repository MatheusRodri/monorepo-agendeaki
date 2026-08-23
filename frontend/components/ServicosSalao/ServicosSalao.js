'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AlternadorTema from '../AlternadorTema/AlternadorTema';
import { lerRespostaApi, obterUrlApi } from '../../utils/respostaApi';

export default function ServicosSalao({ idUnidade }) {
  const [servicos, definirServicos] = useState([]);
  const [mensagem, definirMensagem] = useState('Carregando serviços...');

  useEffect(() => {
    async function buscarServicos() {
      try {
        const tokenAcesso = sessionStorage.getItem('tokenAcesso');
        const urlApi = obterUrlApi();
        const resposta = await fetch(`${urlApi}/api/clientes/saloes/${idUnidade}/servicos`, {
          headers: tokenAcesso ? { Authorization: `Bearer ${tokenAcesso}` } : {},
        });
        const { dados: dadosResposta, mensagem: mensagemResposta } = await lerRespostaApi(resposta);
        if (!resposta.ok) throw new Error(dadosResposta.mensagem ?? mensagemResposta ?? 'Não foi possível carregar os serviços.');
        definirServicos(dadosResposta.servicos);
        definirMensagem(dadosResposta.servicos.length ? '' : 'Esta unidade ainda não possui serviços disponíveis.');
      } catch (erro) {
        definirMensagem(erro.message);
      }
    }

    buscarServicos();
  }, [idUnidade]);

  return (
    <main className="pagina-servicos">
      <header className="cabecalho-area"><Link aria-label="AgendeAki: página inicial" className="marca" href="/"><span aria-hidden="true" className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><nav aria-label="Navegação do cliente"><Link href="/cliente/inicio">Explorar</Link><Link href="/cliente/agendamentos">Agendamentos</Link><Link href="/cliente/configuracoes">Configurações</Link></nav><AlternadorTema /></header>
      <section className="conteudo-servicos conteudo-limitado">
        <Link className="voltar-home" href="/cliente/inicio">← Voltar para o mapa</Link>
        <p className="sobretitulo">Escolha seu cuidado</p><h1>Serviços disponíveis nesta unidade.</h1>
        {mensagem && <p className="estado-lista">{mensagem}</p>}
        <div className="grade-servicos">
          {servicos.map((servico) => (
            <article className="cartao-servico" key={servico.idServico}>
              <span className="cartao-servico__icone">✦</span><div><h2>{servico.nome}</h2><p>{servico.descricao || 'Um cuidado pensado para você.'}</p></div>
              <div className="cartao-servico__rodape"><span><strong>R$ {servico.valor.toFixed(2).replace('.', ',')}</strong><small>{servico.duracaoMinutos} min</small></span>{servico.profissionais.length ? <div className="profissionais-servico">{servico.profissionais.map((profissional) => <Link href={`/cliente/agendamento?idUnidade=${idUnidade}&idServico=${servico.idServico}&idFuncionario=${profissional.idFuncionario}`} key={profissional.idFuncionario}>Agendar com {profissional.nome} →</Link>)}</div> : <small>Nenhum profissional disponível.</small>}</div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
