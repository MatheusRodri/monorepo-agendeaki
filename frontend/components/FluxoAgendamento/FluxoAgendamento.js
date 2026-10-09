'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requisitarApi } from '../../utils/api';
import { limparSessao, obterTokenAcesso } from '../../utils/respostaApi';

function dataLocal(data = new Date()) {
  const deslocamento = data.getTimezoneOffset() * 60000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 10);
}

function caminhoAtual(slugSalao, slugFilial, selecao) {
  const parametros = new URLSearchParams();
  if (selecao.idServico) parametros.set('servico', selecao.idServico);
  if (selecao.idFuncionario) parametros.set('profissional', selecao.idFuncionario);
  if (selecao.data) parametros.set('data', selecao.data);
  if (selecao.horario) parametros.set('horario', selecao.horario);
  const consulta = parametros.toString();
  return `/${slugSalao}/${slugFilial}${consulta ? `?${consulta}` : ''}`;
}

export default function FluxoAgendamento({ slugFilial, slugSalao }) {
  const roteador = useRouter();
  const [pagina, definirPagina] = useState(null);
  const [selecao, definirSelecao] = useState({ data: '', horario: '', idFuncionario: '', idServico: '' });
  const [selecaoInicializada, definirSelecaoInicializada] = useState(false);
  const [horarios, definirHorarios] = useState([]);
  const [observacao, definirObservacao] = useState('');
  const [mensagem, definirMensagem] = useState('Carregando página de agendamento...');
  const [enviando, definirEnviando] = useState(false);
  const [avaliacoes, definirAvaliacoes] = useState({ resumo: {}, servicos: [], avaliacoes: [], temMais: false });
  const [paginaAvaliacoes, definirPaginaAvaliacoes] = useState(1);

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    definirSelecao({
      data: parametros.get('data') ?? '',
      horario: parametros.get('horario') ?? '',
      idFuncionario: parametros.get('profissional') ?? '',
      idServico: parametros.get('servico') ?? '',
    });
    definirSelecaoInicializada(true);
    requisitarApi(`/api/publico/agendamento/${slugSalao}/${slugFilial}`)
      .then((dados) => { definirPagina(dados); definirMensagem(dados.disponivel ? '' : 'Esta filial está temporariamente sem serviços ou profissionais disponíveis.'); })
      .catch((erro) => definirMensagem(erro.message));
  }, [slugFilial, slugSalao]);

  useEffect(() => {
    if (!pagina?.filial?.idUnidade) return;
    let ativo = true;
    requisitarApi(`/api/publico/avaliacoes/${pagina.filial.idUnidade}`, { parametros: { pagina: paginaAvaliacoes } })
      .then((dados) => { if (ativo) definirAvaliacoes((atuais) => ({ ...dados, avaliacoes: paginaAvaliacoes === 1 ? dados.avaliacoes : [...atuais.avaliacoes, ...dados.avaliacoes] })); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [pagina?.filial?.idUnidade, paginaAvaliacoes]);

  useEffect(() => {
    if (!selecaoInicializada) return;
    const novoCaminho = caminhoAtual(slugSalao, slugFilial, selecao);
    const caminhoNavegador = `${window.location.pathname}${window.location.search}`;
    if (novoCaminho !== caminhoNavegador) window.history.replaceState(null, '', novoCaminho);
  }, [selecao, selecaoInicializada, slugFilial, slugSalao]);

  const servico = useMemo(() => pagina?.servicos.find((item) => String(item.idServico) === String(selecao.idServico)), [pagina, selecao.idServico]);
  const dataMaxima = useMemo(() => { const limite = new Date(); limite.setDate(limite.getDate() + 60); return dataLocal(limite); }, []);

  useEffect(() => {
    const idFuncionarioValido = selecao.idFuncionario === 'qualquer'
      || servico?.profissionais.some((item) => String(item.idFuncionario) === String(selecao.idFuncionario));
    if (!servico || !selecao.data || !idFuncionarioValido) { definirHorarios([]); return; }
    definirMensagem('Consultando horários disponíveis...');
    requisitarApi(`/api/publico/agendamento/${slugSalao}/${slugFilial}/horarios`, {
      parametros: { data: selecao.data, idFuncionario: selecao.idFuncionario, idServico: selecao.idServico },
    }).then((dados) => {
      definirHorarios(dados.horarios);
      definirMensagem(dados.horarios.length ? '' : 'Não há horários disponíveis nesta data. Escolha outro dia.');
    }).catch((erro) => { definirHorarios([]); definirMensagem(erro.message); });
  }, [selecao.data, selecao.idFuncionario, selecao.idServico, servico, slugFilial, slugSalao]);

  function atualizarSelecao(alteracoes) {
    definirSelecao((atual) => ({ ...atual, ...alteracoes }));
  }

  async function confirmar(evento) {
    evento.preventDefault();
    if (!servico || !selecao.data || !selecao.horario || !selecao.idFuncionario) return;
    const retorno = caminhoAtual(slugSalao, slugFilial, selecao);
    if (!obterTokenAcesso()) {
      localStorage.setItem('retornoAgendamento', retorno);
      roteador.push(`/cliente?retorno=${encodeURIComponent(retorno)}`);
      return;
    }
    definirEnviando(true); definirMensagem('');
    try {
      await requisitarApi('/api/clientes/agendamentos', {
        dados: {
          dataHoraInicio: `${selecao.data}T${selecao.horario}:00`,
          idFuncionario: selecao.idFuncionario === 'qualquer' ? null : Number(selecao.idFuncionario),
          idServico: Number(selecao.idServico),
          idUnidade: pagina.filial.idUnidade,
          observacao,
        },
        metodo: 'POST',
      });
      definirMensagem('Agendamento confirmado com sucesso!');
      localStorage.removeItem('retornoAgendamento');
      definirHorarios((atuais) => atuais.filter((item) => item.inicio !== selecao.horario));
      atualizarSelecao({ horario: '' });
    } catch (erro) {
      if (erro.status === 401) {
        limparSessao(); localStorage.setItem('retornoAgendamento', retorno);
        roteador.push(`/cliente?retorno=${encodeURIComponent(retorno)}`);
      } else definirMensagem(erro.message);
    } finally { definirEnviando(false); }
  }

  if (!pagina) return <main className="pagina-agendamento-publico"><p className="estado-lista">{mensagem}</p></main>;
  const filial = pagina.filial;
  return <main className="pagina-agendamento-publico">
    <header className="cabecalho-agendamento-publico"><Link className="marca" href="/"><span className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><Link href="/cliente/inicio">Explorar salões</Link></header>
    <section className="apresentacao-filial"><p className="sobretitulo">Agendamento online</p><h1>{filial.nomeSalao}</h1><p><strong>{filial.nomeUnidade}</strong> · {String(filial.categoria).toLowerCase()}</p><address>{filial.rua}, {filial.numero}{filial.complemento ? ` · ${filial.complemento}` : ''}<br />{filial.bairro}, {filial.municipio}/{filial.estado}{filial.telefone ? ` · ${filial.telefone}` : ''}</address></section>
    <form className="fluxo-agendamento" onSubmit={confirmar}>
      <Etapa numero="1" titulo="Escolha o serviço">
        <div className="opcoes-agendamento">{pagina.servicos.map((item) => { const resumo = avaliacoes.servicos.find((avaliacao) => Number(avaliacao.idServico) === Number(item.idServico)); return <button className={String(item.idServico) === String(selecao.idServico) ? 'opcao-agendamento opcao-agendamento--ativa' : 'opcao-agendamento'} key={item.idServico} onClick={() => atualizarSelecao({ data: '', horario: '', idFuncionario: '', idServico: String(item.idServico) })} type="button"><strong>{item.nome}</strong><span>{item.duracaoMinutos} min · R$ {item.valor.toFixed(2).replace('.', ',')}</span><small>{item.descricao || 'Um cuidado pensado para você.'}</small>{resumo && <small>★ {Number(resumo.mediaServico).toFixed(1)} · {resumo.quantidade} avaliações</small>}</button>; })}</div>
      </Etapa>
      {servico && <Etapa numero="2" titulo="Escolha o profissional"><div className="opcoes-agendamento opcoes-agendamento--compactas"><button className={selecao.idFuncionario === 'qualquer' ? 'opcao-agendamento opcao-agendamento--ativa' : 'opcao-agendamento'} onClick={() => atualizarSelecao({ data: '', horario: '', idFuncionario: 'qualquer' })} type="button"><strong>Sem preferência</strong><small>Atribuição automática no momento da confirmação.</small></button>{servico.profissionais.map((item) => <button className={String(item.idFuncionario) === String(selecao.idFuncionario) ? 'opcao-agendamento opcao-agendamento--ativa' : 'opcao-agendamento'} key={item.idFuncionario} onClick={() => atualizarSelecao({ data: '', horario: '', idFuncionario: String(item.idFuncionario) })} type="button"><strong>{item.nome}</strong></button>)}</div></Etapa>}
      {selecao.idFuncionario && <Etapa numero="3" titulo="Escolha a data"><label className="campo-formulario campo-data-agendamento"><span>Data do atendimento</span><input max={dataMaxima} min={dataLocal()} onChange={(evento) => atualizarSelecao({ data: evento.target.value, horario: '' })} required type="date" value={selecao.data} /></label></Etapa>}
      {selecao.data && <Etapa numero="4" titulo="Escolha o horário"><div className="grade-horarios">{horarios.map((item) => <button className={item.inicio === selecao.horario ? 'horario-disponivel horario-disponivel--ativo' : 'horario-disponivel'} key={item.inicio} onClick={() => atualizarSelecao({ horario: item.inicio })} type="button">{item.inicio}</button>)}</div>{mensagem && <p className="estado-lista">{mensagem}</p>}</Etapa>}
      {selecao.horario && <Etapa numero="5" titulo="Revise e confirme"><div className="resumo-agendamento"><strong>{servico.nome}</strong><span>{selecao.data.split('-').reverse().join('/')} às {selecao.horario}</span><span>{servico.duracaoMinutos} min · R$ {servico.valor.toFixed(2).replace('.', ',')}</span></div><label className="campo-formulario"><span>Observação <small>Opcional</small></span><textarea maxLength="500" onChange={(evento) => definirObservacao(evento.target.value)} value={observacao} /></label>{mensagem && <p className="mensagem-formulario">{mensagem}</p>}<button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Confirmando...' : obterTokenAcesso() ? 'Confirmar agendamento' : 'Entrar para confirmar'} →</button></Etapa>}
    </form>
    <section className="avaliacoes-publicas"><h2>Avaliações desta filial</h2><p>{avaliacoes.resumo.quantidade ? `★ ${Number(avaliacoes.resumo.mediaSalao).toFixed(1)} · ${avaliacoes.resumo.quantidade} avaliações` : 'Esta filial ainda não recebeu avaliações.'}</p><div className="lista-avaliacoes">{avaliacoes.avaliacoes.map((avaliacao) => <article className="cartao-avaliacao" key={avaliacao.idAvaliacao}><strong>{avaliacao.primeiroNome}</strong><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(avaliacao.dataAvaliacao))} · {avaliacao.servico}</small><span>Filial {avaliacao.notaSalao} ★ · Serviço {avaliacao.notaServico} ★</span>{avaliacao.comentario && <p>{avaliacao.comentario}</p>}</article>)}</div>{avaliacoes.temMais && <button className="botao-secundario" onClick={() => definirPaginaAvaliacoes((atual) => atual + 1)} type="button">Ver mais avaliações</button>}</section>
  </main>;
}

function Etapa({ children, numero, titulo }) {
  return <section className="etapa-agendamento"><div className="etapa-agendamento__titulo"><span>{numero}</span><h2>{titulo}</h2></div>{children}</section>;
}
