'use client';

import { useEffect, useState } from 'react';
import FormularioAgendamentoSalao from '../FormularioAgendamentoSalao/FormularioAgendamentoSalao';

function dataLocal(dias = 0) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 10);
}

function formatarDataHora(valor) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
}

const nomesStatus = { AGENDADO: 'Confirmado', REALIZADO: 'Realizado', CANCELADO: 'Cancelado', NAO_COMPARECEU: 'Não presente' };

export default function AgendaSalao({ dados, tipoAgenda, definirTipoAgenda, requisitar, aoSalvarAgendamento, mostrarToastErro }) {
  const [criando, definirCriando] = useState(false);
  const [enviandoId, definirEnviandoId] = useState(null);
  const [reagendamento, definirReagendamento] = useState(null);
  const [horarios, definirHorarios] = useState([]);
  const [mensagemHorarios, definirMensagemHorarios] = useState('');

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
      await aoSalvarAgendamento(resultado.mensagem);
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
      await aoSalvarAgendamento(resultado.mensagem);
    } catch (erro) { definirMensagemHorarios(''); mostrarToastErro(erro.message); }
    finally { definirEnviandoId(null); }
  }

  const profissionais = dados.funcionarios?.filter((item) => Number(item.idUnidade) === Number(reagendamento?.idUnidade)) ?? [];
  return <>
    <p className="sobretitulo">Sua agenda</p><h1>Atendimentos do salão.</h1>
    <div className="cabecalho-agenda-salao"><div className="filtro-agendamentos"><button className={tipoAgenda === 'futuros' ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirTipoAgenda('futuros')} type="button">Próximos</button><button className={tipoAgenda === 'historico' ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirTipoAgenda('historico')} type="button">Histórico</button></div><button className="botao-enviar" onClick={() => definirCriando((valor) => !valor)} type="button">{criando ? 'Fechar formulário' : 'Novo agendamento'} <span>{criando ? '×' : '+'}</span></button></div>
    {criando && <FormularioAgendamentoSalao clientes={dados.clientes ?? []} filiais={dados.filiais ?? []} funcionarios={dados.funcionarios ?? []} mostrarToastErro={mostrarToastErro} requisitar={requisitar} servicos={dados.servicos ?? []} aoCancelar={() => definirCriando(false)} aoSalvar={async (mensagem) => { definirCriando(false); await aoSalvarAgendamento(mensagem); }} />}
    <div className="lista-agendamentos-salao">{dados.agendamentos?.map((agendamento) => {
      const horarioFuturo = new Date(agendamento.dataHoraInicio) > new Date();
      return <article className="cartao-agendamento-salao" key={agendamento.idAgendamento}><div className="cartao-agendamento-salao__cabecalho"><div><strong>{agendamento.cliente}</strong><span>{formatarDataHora(agendamento.dataHoraInicio)} · {agendamento.filial}</span>{(agendamento.emailCliente || agendamento.telefoneCliente) && <small>{[agendamento.telefoneCliente, agendamento.emailCliente].filter(Boolean).join(' · ')}</small>}</div><div className="cartao-agendamento-salao__acoes"><span className={`selo-status selo-status--${String(agendamento.status).toLowerCase()}`}>{nomesStatus[agendamento.status] ?? agendamento.status}</span>{agendamento.status === 'AGENDADO' && <div className="acoes-resultado-agendamento"><button disabled={enviandoId === agendamento.idAgendamento} onClick={() => registrarResultado(agendamento, 'confirmar-atendimento')} type="button">Realizado</button><button disabled={horarioFuturo || enviandoId === agendamento.idAgendamento} onClick={() => registrarResultado(agendamento, 'nao-compareceu')} title={horarioFuturo ? 'Disponível após o horário agendado.' : undefined} type="button">Não presente</button><button disabled={enviandoId === agendamento.idAgendamento} onClick={() => definirReagendamento({ idAgendamento: agendamento.idAgendamento, idUnidade: agendamento.idUnidade, data: dataLocal(), idFuncionario: 'qualquer', horario: '' })} type="button">Reagendar</button></div>}</div></div><dl><div><dt>Serviço</dt><dd>{agendamento.servico} · R$ {Number(agendamento.valor).toFixed(2).replace('.', ',')}</dd></div><div><dt>Profissional</dt><dd>{agendamento.funcionario}</dd></div><div><dt>Pagamento</dt><dd>{agendamento.pago ? 'Pago' : `Não pago (${agendamento.statusPagamento})`}</dd></div><div><dt>Observação</dt><dd>{agendamento.observacao || 'Nenhuma observação.'}</dd></div></dl></article>;
    })}</div>
    {!dados.agendamentos?.length && <p className="estado-lista">Nenhum agendamento encontrado.</p>}
    {reagendamento && <div className="modal-agendamento" role="dialog" aria-modal="true" aria-labelledby="titulo-reagendar"><form className="formulario-agendamento modal-agendamento__conteudo" onSubmit={salvarReagendamento}><button aria-label="Fechar" className="modal-agendamento__fechar" onClick={() => definirReagendamento(null)} type="button">×</button><h2 id="titulo-reagendar">Reagendar atendimento</h2><label className="campo-formulario"><span>Data</span><input max={dataLocal(60)} min={dataLocal()} onChange={(evento) => definirReagendamento({ ...reagendamento, data: evento.target.value, horario: '' })} required type="date" value={reagendamento.data} /></label><label className="campo-formulario"><span>Profissional</span><select onChange={(evento) => definirReagendamento({ ...reagendamento, idFuncionario: evento.target.value, horario: '' })} value={reagendamento.idFuncionario}><option value="qualquer">Qualquer profissional disponível</option>{profissionais.map((item) => <option key={item.idFuncionario} value={item.idFuncionario}>{item.nome}</option>)}</select></label><div className="grade-horarios">{horarios.map((item) => <button className={reagendamento.horario === item.inicio ? 'horario-disponivel horario-disponivel--ativo' : 'horario-disponivel'} key={item.inicio} onClick={() => definirReagendamento({ ...reagendamento, horario: item.inicio })} type="button">{item.inicio}</button>)}</div>{mensagemHorarios && <p className="estado-lista">{mensagemHorarios}</p>}<button className="botao-enviar" disabled={!reagendamento.horario || enviandoId === reagendamento.idAgendamento} type="submit">Salvar novo horário →</button></form></div>}
  </>;
}
