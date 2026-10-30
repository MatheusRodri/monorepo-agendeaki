'use client';

import { useEffect, useState } from 'react';
import ConclusaoAtendimento from './ConclusaoAtendimento';
import FormularioAgendamentoSalao from '../FormularioAgendamentoSalao/FormularioAgendamentoSalao';
import { agendarAtualizacaoTemporal } from '../../utils/atualizacaoTemporal.mjs';

function dataLocal(dias = 0) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const data = new Date(`${hoje}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function formatarDataHora(valor) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(valor));
}

const nomesStatus = { AGENDADO: 'Confirmado', REALIZADO: 'Realizado', CANCELADO: 'Cancelado', NAO_COMPARECEU: 'Não presente' };
const opcoesMotivoCancelamento = [
  ['BLOQUEIO_AGENDA', 'Bloqueio emergencial da agenda pelo salão'],
  ['INDISPONIBILIDADE_PROFISSIONAL', 'Indisponibilidade do profissional'],
  ['SOLICITACAO_CLIENTE', 'Solicitação do cliente'],
  ['PROBLEMA_UNIDADE', 'Problema na unidade'],
  ['ERRO_AGENDAMENTO', 'Erro no agendamento'],
  ['OUTRO', 'Outro motivo'],
];

export default function AgendaSalao({ dados, requisitar, aoSalvarAgendamento, mostrarToastErro }) {
  const [tipoAgenda, definirTipoAgenda] = useState('futuros');
  const [controles, definirControles] = useState({
    futuros: { periodo: 'todos', pagina: 1, porPagina: 10 },
    historico: { pagina: 1, porPagina: 10 },
  });
  const [consulta, definirConsulta] = useState({});
  const [tentativa, definirTentativa] = useState(0);
  const [conclusao, definirConclusao] = useState(null);
  const [criando, definirCriando] = useState(false);
  const [enviandoId, definirEnviandoId] = useState(null);
  const [reagendamento, definirReagendamento] = useState(null);
  const [cancelamento, definirCancelamento] = useState(null);
  const [horarios, definirHorarios] = useState([]);
  const [mensagemHorarios, definirMensagemHorarios] = useState('');
  const controle = controles[tipoAgenda];
  const parametros = new URLSearchParams({ tipo: tipoAgenda, ...controle, periodo: tipoAgenda === 'futuros' ? controle.periodo : 'todos' }).toString();
  const carregando = consulta.chave !== parametros || consulta.carregando;
  const resultado = consulta.chave === parametros ? consulta.resultado : null;
  const erro = consulta.chave === parametros ? consulta.erro : '';

  useEffect(() => agendarAtualizacaoTemporal(
    (resultado?.agendamentos ?? []).filter((item) => item.status === 'AGENDADO' && !item.podeConcluir).map((item) => item.conclusaoDisponivelEm),
    () => definirTentativa((valor) => valor + 1),
  ), [resultado]);

  function alterarControle(alteracoes) {
    definirControles((atuais) => ({ ...atuais, [tipoAgenda]: { ...atuais[tipoAgenda], pagina: 1, ...alteracoes } }));
  }
  async function atualizarAgenda(mensagem) {
    definirTentativa((valor) => valor + 1);
    await aoSalvarAgendamento(mensagem);
  }
  useEffect(() => {
    let ativo = true;
    definirConsulta({ chave: parametros, carregando: true });
    requisitar(`/agendamentos?${parametros}`)
      .then((resposta) => { if (ativo) definirConsulta({ chave: parametros, resultado: resposta }); })
      .catch((falha) => { if (ativo) definirConsulta({ chave: parametros, erro: falha.message }); });
    return () => { ativo = false; };
  }, [parametros, requisitar, tentativa]);

  useEffect(() => {
    if (!reagendamento?.data || !reagendamento?.idFuncionario) { definirHorarios([]); return undefined; }
    let ativo = true;
    definirMensagemHorarios('Consultando horários...');
    const parametros = new URLSearchParams({ data: reagendamento.data, idFuncionario: reagendamento.idFuncionario });
    requisitar(`/agendamentos/${reagendamento.idAgendamento}/horarios-reagendamento?${parametros}`)
      .then((resultado) => { if (ativo) { definirHorarios(resultado.horarios); definirMensagemHorarios(resultado.horarios.length ? '' : 'Nenhum horário disponível nesta data.'); } })
      .catch((erro) => { if (ativo) { definirHorarios([]); definirMensagemHorarios(''); mostrarToastErro(erro.message); } });
    return () => { ativo = false; };
  }, [mostrarToastErro, reagendamento?.data, reagendamento?.idAgendamento, reagendamento?.idFuncionario, requisitar]);

  async function registrarResultado(agendamento, caminho) {
    definirEnviandoId(agendamento.idAgendamento);
    try {
      const resultado = await requisitar(`/agendamentos/${agendamento.idAgendamento}/${caminho}`, { method: 'PATCH' });
      await atualizarAgenda(resultado.mensagem);
    } catch (erro) { mostrarToastErro(erro.message); }
    finally { definirEnviandoId(null); }
  }

  async function salvarCancelamento(evento) {
    evento.preventDefault();
    definirEnviandoId(cancelamento.agendamento.idAgendamento);
    try {
      const resultado = await requisitar(`/agendamentos/${cancelamento.agendamento.idAgendamento}/cancelar`, {
        method: 'PATCH', body: JSON.stringify({ codigoMotivo: cancelamento.codigoMotivo, detalheMotivo: cancelamento.detalheMotivo.trim() }),
      });
      definirCancelamento(null);
      await atualizarAgenda(resultado.mensagem);
    } catch (erro) { mostrarToastErro(erro.message); }
    finally { definirEnviandoId(null); }
  }

  async function salvarReagendamento(evento) {
    evento.preventDefault();
    definirEnviandoId(reagendamento.idAgendamento);
    try {
      const resultado = await requisitar(`/agendamentos/${reagendamento.idAgendamento}/reagendar`, {
        method: 'PATCH', body: JSON.stringify({
          dataHoraInicio: `${reagendamento.data}T${reagendamento.horario}:00`,
          idFuncionario: reagendamento.idFuncionario === 'qualquer' ? null : Number(reagendamento.idFuncionario),
        }),
      });
      definirReagendamento(null);
      await atualizarAgenda(resultado.mensagem);
    } catch (erro) { definirMensagemHorarios(''); mostrarToastErro(erro.message); }
    finally { definirEnviandoId(null); }
  }

  const profissionais = dados.funcionarios?.filter((item) => Number(item.idUnidade) === Number(reagendamento?.idUnidade)) ?? [];
  return <>
    <p className="sobretitulo">Sua agenda</p><h1>Atendimentos do salão.</h1>
    <div className="cabecalho-agenda-salao"><div aria-label="Tipo de agendamentos" className="filtro-agendamentos" role="group"><button aria-pressed={tipoAgenda === 'futuros'} className={tipoAgenda === 'futuros' ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirTipoAgenda('futuros')} type="button">Próximos</button><button aria-pressed={tipoAgenda === 'historico'} className={tipoAgenda === 'historico' ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirTipoAgenda('historico')} type="button">Histórico</button></div><button className="botao-enviar" onClick={() => definirCriando((valor) => !valor)} type="button">{criando ? 'Fechar formulário' : 'Novo agendamento'} <span>{criando ? '×' : '+'}</span></button></div>
    {criando && <FormularioAgendamentoSalao clientes={dados.clientes ?? []} filiais={dados.filiais ?? []} funcionarios={dados.funcionarios ?? []} mostrarToastErro={mostrarToastErro} requisitar={requisitar} servicos={dados.servicos ?? []} aoCancelar={() => definirCriando(false)} aoSalvar={async (mensagem) => { definirCriando(false); await atualizarAgenda(mensagem); }} />}
    <div className="filtros-agenda-salao">
      {tipoAgenda === 'futuros' && <div aria-label="Período dos agendamentos" className="filtros-agenda-salao__periodos" role="group">
        {[['todos', 'Todos'], ['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['7dias', 'Próximos 7 dias']].map(([valor, rotulo]) => <button aria-pressed={controle.periodo === valor} key={valor} onClick={() => alterarControle({ periodo: valor })} type="button">{rotulo}</button>)}
      </div>}
      <label className="campo-formulario"><span>Agendamentos por página</span><select onChange={(evento) => alterarControle({ porPagina: Number(evento.target.value) })} value={controle.porPagina}>{[10, 25, 50].map((valor) => <option key={valor} value={valor}>{valor}</option>)}</select></label>
    </div>
    <p className="agenda-salao__periodo">Horário de São Paulo.{tipoAgenda === 'futuros' && controle.periodo === '7dias' && ' Inclui hoje e os seis dias seguintes.'}</p>
    <section aria-busy={Boolean(carregando)} aria-label="Lista de agendamentos">
    {carregando ? <p className="estado-lista" role="status">Carregando agendamentos...</p> : erro ? <div className="agenda-salao__erro" role="alert"><p>{erro}</p><button className="botao-secundario" onClick={() => definirTentativa((valor) => valor + 1)} type="button">Tentar novamente</button></div> : <>
    <div className="lista-agendamentos-salao">{resultado?.agendamentos?.map((agendamento) => {
      const horarioFuturo = new Date(agendamento.dataHoraInicio) > new Date();
      const podeConcluir = agendamento.podeConcluir === true || Number(agendamento.podeConcluir) === 1;
      return <article className="cartao-agendamento-salao" key={agendamento.idAgendamento}><div className="cartao-agendamento-salao__cabecalho"><div><strong>{agendamento.cliente}</strong><span>{formatarDataHora(agendamento.dataHoraInicio)} · {agendamento.filial}</span>{(agendamento.emailCliente || agendamento.telefoneCliente) && <div className="contatos-cliente-agendamento">{agendamento.emailCliente && <small>{agendamento.emailCliente}</small>}{agendamento.telefoneCliente && <small>{agendamento.telefoneCliente}</small>}</div>}</div><div className="cartao-agendamento-salao__acoes"><span className={`selo-status selo-status--${String(agendamento.status).toLowerCase()}`}>{nomesStatus[agendamento.status] ?? agendamento.status}</span>{agendamento.status === 'AGENDADO' && <div className="acoes-resultado-agendamento"><button disabled={!podeConcluir || enviandoId === agendamento.idAgendamento} onClick={() => definirConclusao(agendamento)} title={!podeConcluir ? `Disponível a partir de ${formatarDataHora(agendamento.conclusaoDisponivelEm)}, no horário de São Paulo.` : undefined} type="button">Realizado</button>{!podeConcluir && <small>Conclusão disponível a partir de {formatarDataHora(agendamento.conclusaoDisponivelEm)} (São Paulo).</small>}<button disabled={horarioFuturo || enviandoId === agendamento.idAgendamento} onClick={() => registrarResultado(agendamento, 'nao-compareceu')} title={horarioFuturo ? 'Disponível após o horário agendado.' : undefined} type="button">Não presente</button><button disabled={enviandoId === agendamento.idAgendamento} onClick={() => definirReagendamento({ idAgendamento: agendamento.idAgendamento, idUnidade: agendamento.idUnidade, data: dataLocal(), idFuncionario: 'qualquer', horario: '' })} type="button">Reagendar</button><button disabled={enviandoId === agendamento.idAgendamento} onClick={() => definirCancelamento({ agendamento, codigoMotivo: '', detalheMotivo: '' })} type="button">Cancelar</button></div>}</div></div><dl><div><dt>Serviço</dt><dd>{agendamento.servico} · R$ {Number(agendamento.valor).toFixed(2).replace('.', ',')}{agendamento.servicosAdicionais?.map((extra, indice) => <small className="servico-adicional-historico" key={indice}>+ {extra.servico} · {extra.profissional} · R$ {Number(extra.valorCobrado).toFixed(2).replace('.', ',')}</small>)}{agendamento.servicosAdicionais?.length > 0 && <strong className="servico-adicional-historico">Total: R$ {Number(agendamento.valorTotal).toFixed(2).replace('.', ',')}</strong>}</dd></div><div><dt>Profissional</dt><dd>{agendamento.funcionario}</dd></div><div><dt>Observação</dt><dd>{agendamento.observacao || 'Nenhuma observação.'}</dd></div></dl></article>;
    })}</div>
    {!resultado?.agendamentos?.length && <p className="estado-lista">Nenhum agendamento encontrado{tipoAgenda === 'historico' || controle.periodo === 'todos' ? '.' : ' para este período.'}</p>}
    </>}
    </section>
    <nav aria-label="Paginação da agenda" className="paginacao-agenda-salao">
      <span aria-live="polite">{carregando ? 'Atualizando lista...' : erro ? 'Contagem indisponível.' : `${resultado?.total ? `${(resultado.pagina - 1) * resultado.porPagina + 1}–${Math.min(resultado.pagina * resultado.porPagina, resultado.total)} de ${resultado.total} agendamentos` : '0 agendamentos'} · Página ${resultado?.pagina ?? 1} de ${resultado?.totalPaginas ?? 1}`}</span>
      <div><button className="botao-secundario" disabled={Boolean(carregando || erro || !resultado || resultado.pagina <= 1)} onClick={() => alterarControle({ pagina: resultado.pagina - 1 })} type="button">Anterior</button><button className="botao-secundario" disabled={Boolean(carregando || erro || !resultado || resultado.pagina >= resultado.totalPaginas)} onClick={() => alterarControle({ pagina: resultado.pagina + 1 })} type="button">Próxima</button></div>
    </nav>
    {conclusao && <ConclusaoAtendimento agendamento={conclusao} servicos={dados.servicos ?? []} funcionarios={dados.funcionarios ?? []} requisitar={requisitar} aoFechar={() => definirConclusao(null)} aoSalvar={atualizarAgenda} mostrarToastErro={mostrarToastErro} />}
    {cancelamento && <div className="modal-agendamento" role="presentation"><form className="formulario-agendamento modal-agendamento__conteudo modal-cancelamento__conteudo" onSubmit={salvarCancelamento} role="dialog" aria-modal="true" aria-labelledby="titulo-cancelar"><button aria-label="Fechar" className="modal-agendamento__fechar" disabled={enviandoId === cancelamento.agendamento.idAgendamento} onClick={() => definirCancelamento(null)} type="button">×</button><h2 id="titulo-cancelar">Cancelar agendamento</h2><p>O cliente {cancelamento.agendamento.cliente} será avisado. Selecione o motivo do cancelamento.</p><label className="campo-formulario modal-cancelamento__campo"><span>Motivo</span><select onChange={(evento) => definirCancelamento({ ...cancelamento, codigoMotivo: evento.target.value, detalheMotivo: '' })} required value={cancelamento.codigoMotivo}><option value="">Selecione um motivo</option>{opcoesMotivoCancelamento.map(([codigo, rotulo]) => <option key={codigo} value={codigo}>{rotulo}</option>)}</select></label>{cancelamento.codigoMotivo === 'OUTRO' && <label className="campo-formulario modal-cancelamento__campo"><span>Descreva o motivo</span><textarea maxLength="200" onChange={(evento) => definirCancelamento({ ...cancelamento, detalheMotivo: evento.target.value })} required value={cancelamento.detalheMotivo} /></label>}<div className="acoes-formulario modal-cancelamento__acoes"><button className="botao-secundario" disabled={enviandoId === cancelamento.agendamento.idAgendamento} onClick={() => definirCancelamento(null)} type="button">Voltar</button><button className="botao-enviar" disabled={enviandoId === cancelamento.agendamento.idAgendamento} type="submit">{enviandoId === cancelamento.agendamento.idAgendamento ? 'Cancelando...' : 'Confirmar cancelamento'}</button></div></form></div>}
    {reagendamento && <div className="modal-agendamento" role="dialog" aria-modal="true" aria-labelledby="titulo-reagendar"><form className="formulario-agendamento modal-agendamento__conteudo" onSubmit={salvarReagendamento}><button aria-label="Fechar" className="modal-agendamento__fechar" onClick={() => definirReagendamento(null)} type="button">×</button><h2 id="titulo-reagendar">Reagendar atendimento</h2><label className="campo-formulario"><span>Data</span><input max={dataLocal(60)} min={dataLocal()} onChange={(evento) => definirReagendamento({ ...reagendamento, data: evento.target.value, horario: '' })} required type="date" value={reagendamento.data} /></label><label className="campo-formulario"><span>Profissional</span><select onChange={(evento) => definirReagendamento({ ...reagendamento, idFuncionario: evento.target.value, horario: '' })} value={reagendamento.idFuncionario}><option value="qualquer">Qualquer profissional disponível</option>{profissionais.map((item) => <option key={item.idFuncionario} value={item.idFuncionario}>{item.nome}</option>)}</select></label><div className="grade-horarios">{horarios.map((item) => <button className={reagendamento.horario === item.inicio ? 'horario-disponivel horario-disponivel--ativo' : 'horario-disponivel'} key={item.inicio} onClick={() => definirReagendamento({ ...reagendamento, horario: item.inicio })} type="button">{item.inicio}</button>)}</div>{mensagemHorarios && <p className="estado-lista">{mensagemHorarios}</p>}<button className="botao-enviar" disabled={!reagendamento.horario || enviandoId === reagendamento.idAgendamento} type="submit">Salvar novo horário →</button></form></div>}
  </>;
}
