'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import CabecalhoCliente from '../CabecalhoCliente/CabecalhoCliente';
import { requisitarApi } from '../../utils/api';
import { toastErro, toastSucesso } from '../../utils/toast';
import { agendarAtualizacaoTemporal } from '../../utils/atualizacaoTemporal.mjs';

const listaVazia = [];

export default function ListaAgendamentos() {
  const [filtro, definirFiltro] = useState('futuros');
  const [controles, definirControles] = useState({ futuros: { pagina: 1, porPagina: 10 }, historico: { pagina: 1, porPagina: 10 } });
  const [consulta, definirConsulta] = useState({});
  const [revisao, definirRevisao] = useState(0);
  const [agendamentoEdicao, definirAgendamentoEdicao] = useState(null);
  const [servicos, definirServicos] = useState([]);
  const [horariosEdicao, definirHorariosEdicao] = useState([]);
  const [enviando, definirEnviando] = useState(false);
  const [avaliacao, definirAvaliacao] = useState(null);
  const idAvaliacaoDaUrl = useRef(null);
  const idAgendamentoParaLocalizar = useRef(null);
  const futuros = filtro === 'futuros';
  const controle = controles[filtro];
  const localizar = futuros ? null : idAgendamentoParaLocalizar.current;
  const parametros = new URLSearchParams({ ...controle, ...(localizar ? { localizar } : {}) }).toString();
  const chaveConsulta = `${filtro}?${parametros}`;
  const carregando = consulta.chave !== chaveConsulta || consulta.carregando;
  const resultado = consulta.chave === chaveConsulta ? consulta.resultado : null;
  const erro = consulta.chave === chaveConsulta ? consulta.erro : '';
  const agendamentos = resultado?.agendamentos ?? listaVazia;

  useEffect(() => agendarAtualizacaoTemporal(
    agendamentos.filter((item) => item.status === 'REALIZADO' && !item.idAvaliacao && !item.podeAvaliar).map((item) => item.dataHoraFim),
    () => definirRevisao((valor) => valor + 1),
  ), [agendamentos]);

  async function requisitar(caminho, opcoes = {}) {
    return requisitarApi(`/api/clientes${caminho}`, {
      dados: opcoes.body ? JSON.parse(opcoes.body) : undefined,
      metodo: opcoes.method,
    });
  }

  useEffect(() => {
    let ativo = true;
    definirConsulta({ chave: chaveConsulta, carregando: true });
    requisitar(`/agendamentos/${chaveConsulta}`)
      .then((dados) => {
        if (!ativo) return;
        if (localizar) {
          idAgendamentoParaLocalizar.current = null;
          if (!dados.localizado) idAvaliacaoDaUrl.current = null;
        }
        definirConsulta({ chave: chaveConsulta, resultado: dados });
        if (dados.pagina !== controle.pagina || localizar) definirControles((atuais) => ({ ...atuais, [filtro]: { ...atuais[filtro], pagina: dados.pagina } }));
      })
      .catch((falha) => { if (ativo) definirConsulta({ chave: chaveConsulta, erro: falha.message }); });
    return () => { ativo = false; };
  }, [chaveConsulta, revisao]);

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    const idAgendamento = Number(parametros.get('avaliar'));
    if (Number.isSafeInteger(idAgendamento) && idAgendamento > 0) {
      idAvaliacaoDaUrl.current = idAgendamento;
      idAgendamentoParaLocalizar.current = idAgendamento;
      definirFiltro('historico');
    } else if (parametros.has('historico')) {
      definirFiltro('historico');
    }
  }, []);

  useEffect(() => {
    const idAgendamento = idAvaliacaoDaUrl.current;
    if (!idAgendamento || futuros) return;
    if (carregando) return;
    const agendamento = agendamentos.find((item) => Number(item.idAgendamento) === idAgendamento);
    if (!agendamento) return;
    const podeAvaliar = agendamento.podeAvaliar === true || Number(agendamento.podeAvaliar) === 1;
    if (podeAvaliar && !agendamento.idAvaliacao) {
      definirAvaliacao({ idAgendamento, notaSalao: 5, notaServico: 5, comentario: '' });
    }
    if (podeAvaliar || agendamento.idAvaliacao) {
      requisitar(`/notificacoes/agendamentos/${idAgendamento}/lida`, { method: 'PATCH' }).catch((erro) => toastErro(erro.message));
    }
    idAvaliacaoDaUrl.current = null;
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [agendamentos, futuros, carregando]);

  useEffect(() => {
    if (!agendamentoEdicao?.data || !agendamentoEdicao?.idServico || !agendamentoEdicao?.idFuncionario) { definirHorariosEdicao([]); return; }
    let ativo = true;
    definirHorariosEdicao([]);
    const parametros = new URLSearchParams({
      data: agendamentoEdicao.data,
      idFuncionario: agendamentoEdicao.idFuncionario,
      idServico: agendamentoEdicao.idServico,
      idUnidade: agendamentoEdicao.idUnidade,
    });
    requisitar(`/agendamentos/${agendamentoEdicao.idAgendamento}/horarios?${parametros}`)
      .then((dados) => { if (ativo) definirHorariosEdicao(dados.horarios); })
      .catch((erro) => { if (ativo) { definirHorariosEdicao([]); toastErro(erro.message); } });
    return () => { ativo = false; };
  }, [agendamentoEdicao?.data, agendamentoEdicao?.idFuncionario, agendamentoEdicao?.idServico, agendamentoEdicao?.idAgendamento, agendamentoEdicao?.idUnidade]);

  async function cancelarAgendamento(agendamento) {
    if (!window.confirm(`Cancelar o agendamento de ${agendamento.servico}?`)) return;
    definirEnviando(true);
    try {
      const dados = await requisitar(`/agendamentos/${agendamento.idAgendamento}/cancelar`, { method: 'PATCH' });
      toastSucesso(dados.mensagem);
      idAgendamentoParaLocalizar.current = agendamento.idAgendamento;
      definirControles((atuais) => ({ ...atuais, historico: { ...atuais.historico, pagina: 1 } }));
      definirFiltro('historico');
    } catch (erro) { toastErro(erro.message); } finally { definirEnviando(false); }
  }

  async function abrirEdicao(agendamento) {
    try {
      const dados = await requisitar(`/saloes/${agendamento.idUnidade}/servicos`);
      definirServicos(dados.servicos);
      const dataHora = new Date(agendamento.dataHoraInicio);
      const data = `${dataHora.getFullYear()}-${String(dataHora.getMonth() + 1).padStart(2, '0')}-${String(dataHora.getDate()).padStart(2, '0')}`;
      const horario = `${String(dataHora.getHours()).padStart(2, '0')}:${String(dataHora.getMinutes()).padStart(2, '0')}`;
      definirAgendamentoEdicao({ ...agendamento, data, horario, idFuncionario: String(agendamento.idFuncionario), observacao: agendamento.observacao ?? '' });
    } catch (erro) { toastErro(erro.message); }
  }

  async function salvarEdicao(evento) {
    evento.preventDefault();
    definirEnviando(true);
    try {
      const dados = await requisitar(`/agendamentos/${agendamentoEdicao.idAgendamento}`, { method: 'PATCH', body: JSON.stringify({ ...agendamentoEdicao, dataHoraInicio: `${agendamentoEdicao.data}T${agendamentoEdicao.horario}:00`, idFuncionario: agendamentoEdicao.idFuncionario === 'qualquer' ? null : Number(agendamentoEdicao.idFuncionario) }) });
      toastSucesso(dados.mensagem); definirAgendamentoEdicao(null); definirRevisao((valor) => valor + 1);
    } catch (erro) { toastErro(erro.message); } finally { definirEnviando(false); }
  }

  async function enviarAvaliacao(evento) {
    evento.preventDefault();
    definirEnviando(true);
    try {
      const resultado = await requisitar(`/agendamentos/${avaliacao.idAgendamento}/avaliacao`, { method: 'POST', body: JSON.stringify(avaliacao) });
      definirAvaliacao(null);
      toastSucesso(resultado.mensagem);
      definirRevisao((valor) => valor + 1);
    } catch (erro) { toastErro(erro.message); }
    finally { definirEnviando(false); }
  }

  const servicoEdicao = servicos.find((servico) => Number(servico.idServico) === Number(agendamentoEdicao?.idServico));

  return <main className="pagina-agendamentos">
    <CabecalhoCliente secao="agendamentos" />
    <section className="conteudo-agendamentos conteudo-limitado">
      <p className="sobretitulo">Sua agenda</p><h1>Seus momentos de cuidado.</h1>
      <div className="filtro-agendamentos" role="group" aria-label="Filtro de agendamentos">
        <button aria-pressed={futuros} className={futuros ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirFiltro('futuros')} type="button">Próximos horários</button>
        <button aria-pressed={!futuros} className={!futuros ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirFiltro('historico')} type="button">Histórico</button>
      </div>
      <div className="controles-agendamentos-cliente">
        <label className="campo-formulario"><span>Agendamentos por página</span><select onChange={(evento) => definirControles((atuais) => ({ ...atuais, [filtro]: { pagina: 1, porPagina: Number(evento.target.value) } }))} value={controle.porPagina}>{[10, 25, 50].map((valor) => <option key={valor} value={valor}>{valor}</option>)}</select></label>
      </div>
      <div aria-busy={Boolean(carregando)}>
        {carregando ? <p className="estado-lista" role="status">Carregando seus agendamentos...</p> : erro ? <div className="erro-agendamentos-cliente" role="alert"><p>{erro}</p><button className="botao-secundario" onClick={() => definirRevisao((valor) => valor + 1)} type="button">Tentar novamente</button></div> : <>
          {!agendamentos.length && <p className="estado-lista">{futuros ? 'Você ainda não tem horários agendados.' : 'Seu histórico aparecerá aqui.'}</p>}
          <div className="lista-agendamentos">{agendamentos.map((agendamento) => <article className="cartao-agendamento-lista" key={agendamento.idAgendamento}><span className="data-agendamento">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(agendamento.dataHoraInicio))}</span><div><span className={`status-agendamento status-agendamento--${agendamento.status.toLowerCase()}`}>{agendamento.status === 'NAO_COMPARECEU' ? 'Não presente' : agendamento.status.toLowerCase()}</span><h2>{agendamento.servico}</h2>{agendamento.servicosAdicionais?.map((extra, indice) => <small key={indice}>+ {extra.servico} · {extra.profissional} · R$ {Number(extra.valorCobrado).toFixed(2).replace('.', ',')}</small>)}<p>{agendamento.salao} · {agendamento.unidade}, {agendamento.municipio}</p><small>Com {agendamento.profissional} · {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(agendamento.dataHoraInicio))}</small>{agendamento.status === 'CANCELADO' && <small className="motivo-cancelamento-agendamento"><strong>Motivo do cancelamento:</strong> {agendamento.motivoCancelamento || 'Não informado.'}</small>}{agendamento.observacao && <small className="observacao-agendamento">Observação: {agendamento.observacao}</small>}</div><div className="acoes-agendamento"><strong>R$ {Number(agendamento.valorTotal ?? agendamento.valor).toFixed(2).replace('.', ',')}</strong>{futuros && <><button disabled={enviando} onClick={() => abrirEdicao(agendamento)} type="button">Editar</button><button className="acao-perigosa" disabled={enviando} onClick={() => cancelarAgendamento(agendamento)} type="button">Cancelar</button></>}{!futuros && agendamento.status === 'REALIZADO' && (agendamento.idAvaliacao ? <small>Avaliado ✓</small> : <><button disabled={!agendamento.podeAvaliar || enviando} onClick={() => { if (agendamento.podeAvaliar) definirAvaliacao({ idAgendamento: agendamento.idAgendamento, notaSalao: 5, notaServico: 5, comentario: '' }); }} type="button">Avaliar</button>{!agendamento.podeAvaliar && <small>Avaliação disponível em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(agendamento.dataHoraFim))} (São Paulo).</small>}</>)}</div></article>)}</div>
        </>}
      </div>
      <nav aria-label="Paginação dos agendamentos" className="paginacao-agendamentos-cliente">
        <span aria-live="polite">{carregando ? 'Atualizando lista...' : erro ? 'Contagem indisponível.' : `${resultado?.total ? `${(resultado.pagina - 1) * resultado.porPagina + 1}–${Math.min(resultado.pagina * resultado.porPagina, resultado.total)} de ${resultado.total} agendamentos` : '0 agendamentos'} · Página ${resultado?.pagina ?? 1} de ${resultado?.totalPaginas ?? 1}`}</span>
        <div><button className="botao-secundario" disabled={Boolean(carregando || erro || !resultado || resultado.pagina <= 1)} onClick={() => definirControles((atuais) => ({ ...atuais, [filtro]: { ...atuais[filtro], pagina: resultado.pagina - 1 } }))} type="button">Anterior</button><button className="botao-secundario" disabled={Boolean(carregando || erro || !resultado || resultado.pagina >= resultado.totalPaginas)} onClick={() => definirControles((atuais) => ({ ...atuais, [filtro]: { ...atuais[filtro], pagina: resultado.pagina + 1 } }))} type="button">Próxima</button></div>
      </nav>
    </section>
    {avaliacao && <div className="modal-agendamento modal-avaliacao" role="dialog" aria-modal="true" aria-labelledby="titulo-avaliacao">
      <form className="formulario-agendamento modal-agendamento__conteudo modal-avaliacao__conteudo" onSubmit={enviarAvaliacao}>
        <button aria-label="Fechar" className="modal-agendamento__fechar" disabled={enviando} onClick={() => definirAvaliacao(null)} type="button">×</button>
        <h2 id="titulo-avaliacao">Avaliar atendimento</h2>
        <ClassificacaoEstrelas campo="notaSalao" rotulo="Nota da unidade" valor={avaliacao.notaSalao} desabilitado={enviando} aoMudar={(nota) => definirAvaliacao((atual) => ({ ...atual, notaSalao: nota }))} />
        <ClassificacaoEstrelas campo="notaServico" rotulo="Nota do serviço" valor={avaliacao.notaServico} desabilitado={enviando} aoMudar={(nota) => definirAvaliacao((atual) => ({ ...atual, notaServico: nota }))} />
        <label className="campo-formulario"><span>Comentário <small>Opcional</small></span><textarea maxLength="500" onChange={(evento) => definirAvaliacao((atual) => ({ ...atual, comentario: evento.target.value }))} value={avaliacao.comentario} /></label>
        <button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Publicando...' : 'Publicar avaliação'} →</button>
      </form>
    </div>}
    {agendamentoEdicao && <div className="modal-agendamento" role="dialog" aria-modal="true"><form className="formulario-agendamento modal-agendamento__conteudo" onSubmit={salvarEdicao}><button aria-label="Fechar" className="modal-agendamento__fechar" onClick={() => definirAgendamentoEdicao(null)} type="button">×</button><p className="sobretitulo">Ajuste seu horário</p><h2>Editar agendamento</h2><label className="campo-formulario"><span>Serviço</span><select onChange={(evento) => { const idServico = Number(evento.target.value); definirAgendamentoEdicao({ ...agendamentoEdicao, horario: '', idServico, idFuncionario: '' }); }} value={agendamentoEdicao.idServico}>{servicos.map((servico) => <option key={servico.idServico} value={servico.idServico}>{servico.nome}</option>)}</select></label><label className="campo-formulario"><span>Profissional</span><select onChange={(evento) => definirAgendamentoEdicao({ ...agendamentoEdicao, horario: '', idFuncionario: evento.target.value })} required value={agendamentoEdicao.idFuncionario}><option value="qualquer">Sem preferência</option>{servicoEdicao?.profissionais.map((profissional) => <option key={profissional.idFuncionario} value={profissional.idFuncionario}>{profissional.nome}</option>)}</select></label><label className="campo-formulario"><span>Data</span><input max={dataLimite()} min={dataHoje()} onChange={(evento) => definirAgendamentoEdicao({ ...agendamentoEdicao, data: evento.target.value, horario: '' })} required type="date" value={agendamentoEdicao.data} /></label><div className="grade-horarios">{horariosEdicao.map((item) => <button className={item.inicio === agendamentoEdicao.horario ? 'horario-disponivel horario-disponivel--ativo' : 'horario-disponivel'} key={item.inicio} onClick={() => definirAgendamentoEdicao({ ...agendamentoEdicao, horario: item.inicio })} type="button">{item.inicio}</button>)}</div><label className="campo-formulario"><span>Observação <small>Opcional</small></span><textarea onChange={(evento) => definirAgendamentoEdicao({ ...agendamentoEdicao, observacao: evento.target.value })} value={agendamentoEdicao.observacao} /></label><button className="botao-enviar" disabled={enviando || !agendamentoEdicao.horario} type="submit">Salvar alterações →</button></form></div>}
  </main>;
}

function ClassificacaoEstrelas({ campo, rotulo, valor, desabilitado, aoMudar }) {
  return <fieldset className="avaliacao-estrelas">
    <legend>{rotulo}</legend>
    <div className="avaliacao-estrelas__opcoes">
      {[1, 2, 3, 4, 5].map((nota) => <label className={nota <= valor ? 'avaliacao-estrelas__estrela avaliacao-estrelas__estrela--ativa' : 'avaliacao-estrelas__estrela'} key={nota}>
        <input aria-label={`${nota} ${nota === 1 ? 'estrela' : 'estrelas'}`} checked={valor === nota} disabled={desabilitado} name={campo} onChange={() => aoMudar(nota)} type="radio" value={nota} />
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.5 2.9 5.9 6.6 1-4.8 4.7 1.1 6.6-5.8-3.1-5.8 3.1 1.1-6.6-4.8-4.7 6.6-1z" /></svg>
      </label>)}
    </div>
    <span aria-live="polite" className="avaliacao-estrelas__valor">{valor} de 5 estrelas</span>
  </fieldset>;
}

function dataHoje() { const data = new Date(); data.setMinutes(data.getMinutes() - data.getTimezoneOffset()); return data.toISOString().slice(0, 10); }
function dataLimite() { const data = new Date(); data.setDate(data.getDate() + 60); data.setMinutes(data.getMinutes() - data.getTimezoneOffset()); return data.toISOString().slice(0, 10); }
