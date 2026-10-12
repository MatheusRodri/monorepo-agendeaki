'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import CabecalhoCliente from '../CabecalhoCliente/CabecalhoCliente';
import { requisitarApi } from '../../utils/api';
import { toastErro, toastSucesso } from '../../utils/toast';

export default function ListaAgendamentos() {
  const [filtro, definirFiltro] = useState('futuros');
  const [agendamentos, definirAgendamentos] = useState([]);
  const [mensagem, definirMensagem] = useState('Carregando seus agendamentos...');
  const [agendamentoEdicao, definirAgendamentoEdicao] = useState(null);
  const [servicos, definirServicos] = useState([]);
  const [horariosEdicao, definirHorariosEdicao] = useState([]);
  const [enviando, definirEnviando] = useState(false);
  const [avaliacao, definirAvaliacao] = useState(null);
  const idAvaliacaoDaUrl = useRef(null);
  const futuros = filtro === 'futuros';

  async function requisitar(caminho, opcoes = {}) {
    return requisitarApi(`/api/clientes${caminho}`, {
      dados: opcoes.body ? JSON.parse(opcoes.body) : undefined,
      metodo: opcoes.method,
    });
  }

  async function buscarAgendamentos() {
    definirMensagem('Carregando seus agendamentos...');
    try {
      const dados = await requisitar(`/agendamentos/${filtro}`);
      definirAgendamentos(dados.agendamentos);
      definirMensagem(dados.agendamentos.length ? '' : futuros ? 'Você ainda não tem horários agendados.' : 'Seu histórico aparecerá aqui.');
    } catch (erro) { definirAgendamentos([]); definirMensagem(''); toastErro(erro.message); }
  }

  useEffect(() => { buscarAgendamentos(); }, [filtro]);

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    const idAgendamento = Number(parametros.get('avaliar'));
    if (Number.isSafeInteger(idAgendamento) && idAgendamento > 0) {
      idAvaliacaoDaUrl.current = idAgendamento;
      definirFiltro('historico');
    } else if (parametros.has('historico')) {
      definirFiltro('historico');
    }
  }, []);

  useEffect(() => {
    const idAgendamento = idAvaliacaoDaUrl.current;
    if (!idAgendamento || futuros) return;
    const agendamento = agendamentos.find((item) => Number(item.idAgendamento) === idAgendamento);
    if (!agendamento) return;
    const podeAvaliar = agendamento.podeAvaliar === true || Number(agendamento.podeAvaliar) === 1;
    if (podeAvaliar && !agendamento.idAvaliacao) {
      definirAvaliacao({ idAgendamento, notaSalao: 5, notaServico: 5, comentario: '' });
    }
    requisitar(`/notificacoes/agendamentos/${idAgendamento}/lida`, { method: 'PATCH' }).catch((erro) => toastErro(erro.message));
    idAvaliacaoDaUrl.current = null;
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [agendamentos, futuros]);

  useEffect(() => {
    if (!agendamentoEdicao?.data || !agendamentoEdicao?.idServico || !agendamentoEdicao?.idFuncionario) { definirHorariosEdicao([]); return; }
    const parametros = new URLSearchParams({
      data: agendamentoEdicao.data,
      idFuncionario: agendamentoEdicao.idFuncionario,
      idServico: agendamentoEdicao.idServico,
      idUnidade: agendamentoEdicao.idUnidade,
    });
    requisitar(`/agendamentos/${agendamentoEdicao.idAgendamento}/horarios?${parametros}`)
      .then((dados) => definirHorariosEdicao(dados.horarios))
      .catch((erro) => { definirHorariosEdicao([]); toastErro(erro.message); });
  }, [agendamentoEdicao?.data, agendamentoEdicao?.idFuncionario, agendamentoEdicao?.idServico]);

  async function cancelarAgendamento(agendamento) {
    if (!window.confirm(`Cancelar o agendamento de ${agendamento.servico}?`)) return;
    definirEnviando(true);
    try {
      const dados = await requisitar(`/agendamentos/${agendamento.idAgendamento}/cancelar`, { method: 'PATCH' });
      toastSucesso(dados.mensagem); definirFiltro('historico');
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
      toastSucesso(dados.mensagem); definirAgendamentoEdicao(null); buscarAgendamentos();
    } catch (erro) { toastErro(erro.message); } finally { definirEnviando(false); }
  }

  async function enviarAvaliacao(evento) {
    evento.preventDefault();
    definirEnviando(true);
    try {
      const resultado = await requisitar(`/agendamentos/${avaliacao.idAgendamento}/avaliacao`, { method: 'POST', body: JSON.stringify(avaliacao) });
      definirAvaliacao(null);
      toastSucesso(resultado.mensagem);
      await buscarAgendamentos();
    } catch (erro) { toastErro(erro.message); }
    finally { definirEnviando(false); }
  }

  const servicoEdicao = servicos.find((servico) => Number(servico.idServico) === Number(agendamentoEdicao?.idServico));

  return <main className="pagina-agendamentos">
    <CabecalhoCliente secao="agendamentos" />
    <section className="conteudo-agendamentos conteudo-limitado"><p className="sobretitulo">Sua agenda</p><h1>Seus momentos de cuidado.</h1><div className="filtro-agendamentos" role="group" aria-label="Filtro de agendamentos"><button className={futuros ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirFiltro('futuros')} type="button">Próximos horários</button><button className={!futuros ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirFiltro('historico')} type="button">Histórico</button></div>{mensagem && <p className="estado-lista">{mensagem}</p>}{!mensagem && !agendamentos.length && <p className="estado-lista">{futuros ? 'Você ainda não tem horários agendados.' : 'Seu histórico aparecerá aqui.'}</p>}<div className="lista-agendamentos">{agendamentos.map((agendamento) => <article className="cartao-agendamento-lista" key={agendamento.idAgendamento}><span className="data-agendamento">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(agendamento.dataHoraInicio))}</span><div><span className={`status-agendamento status-agendamento--${agendamento.status.toLowerCase()}`}>{agendamento.status === 'NAO_COMPARECEU' ? 'Não presente' : agendamento.status.toLowerCase()}</span><h2>{agendamento.servico}</h2><p>{agendamento.salao} · {agendamento.unidade}, {agendamento.municipio}</p><small>Com {agendamento.profissional} · {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(agendamento.dataHoraInicio))}</small>{agendamento.status === 'CANCELADO' && <small className="motivo-cancelamento-agendamento"><strong>Motivo do cancelamento:</strong> {agendamento.motivoCancelamento || 'Não informado.'}</small>}{agendamento.observacao && <small className="observacao-agendamento">Observação: {agendamento.observacao}</small>}</div><div className="acoes-agendamento"><strong>R$ {Number(agendamento.valor).toFixed(2).replace('.', ',')}</strong>{futuros && <><button disabled={enviando} onClick={() => abrirEdicao(agendamento)} type="button">Editar</button><button className="acao-perigosa" disabled={enviando} onClick={() => cancelarAgendamento(agendamento)} type="button">Cancelar</button></>}{!futuros && agendamento.status === 'REALIZADO' && (agendamento.idAvaliacao ? <small>Avaliado ✓</small> : <button onClick={() => { definirAvaliacao({ idAgendamento: agendamento.idAgendamento, notaSalao: 5, notaServico: 5, comentario: '' }); }} type="button">Avaliar</button>)}</div></article>)}</div></section>
    {avaliacao && <div className="modal-agendamento" role="dialog" aria-modal="true" aria-labelledby="titulo-avaliacao"><form className="formulario-agendamento modal-agendamento__conteudo" onSubmit={enviarAvaliacao}><button aria-label="Fechar" className="modal-agendamento__fechar" onClick={() => definirAvaliacao(null)} type="button">×</button><h2 id="titulo-avaliacao">Avaliar atendimento</h2><label className="campo-formulario"><span>Nota da filial</span><select onChange={(evento) => definirAvaliacao({ ...avaliacao, notaSalao: Number(evento.target.value) })} value={avaliacao.notaSalao}>{[1, 2, 3, 4, 5].map((nota) => <option key={nota} value={nota}>{nota} estrela{nota > 1 ? 's' : ''}</option>)}</select></label><label className="campo-formulario"><span>Nota do serviço</span><select onChange={(evento) => definirAvaliacao({ ...avaliacao, notaServico: Number(evento.target.value) })} value={avaliacao.notaServico}>{[1, 2, 3, 4, 5].map((nota) => <option key={nota} value={nota}>{nota} estrela{nota > 1 ? 's' : ''}</option>)}</select></label><label className="campo-formulario"><span>Comentário <small>Opcional</small></span><textarea maxLength="500" onChange={(evento) => definirAvaliacao({ ...avaliacao, comentario: evento.target.value })} value={avaliacao.comentario} /></label><button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Publicando...' : 'Publicar avaliação'} →</button></form></div>}
    {agendamentoEdicao && <div className="modal-agendamento" role="dialog" aria-modal="true"><form className="formulario-agendamento modal-agendamento__conteudo" onSubmit={salvarEdicao}><button aria-label="Fechar" className="modal-agendamento__fechar" onClick={() => definirAgendamentoEdicao(null)} type="button">×</button><p className="sobretitulo">Ajuste seu horário</p><h2>Editar agendamento</h2><label className="campo-formulario"><span>Serviço</span><select onChange={(evento) => { const idServico = Number(evento.target.value); definirAgendamentoEdicao({ ...agendamentoEdicao, horario: '', idServico, idFuncionario: '' }); }} value={agendamentoEdicao.idServico}>{servicos.map((servico) => <option key={servico.idServico} value={servico.idServico}>{servico.nome}</option>)}</select></label><label className="campo-formulario"><span>Profissional</span><select onChange={(evento) => definirAgendamentoEdicao({ ...agendamentoEdicao, horario: '', idFuncionario: evento.target.value })} required value={agendamentoEdicao.idFuncionario}><option value="qualquer">Sem preferência</option>{servicoEdicao?.profissionais.map((profissional) => <option key={profissional.idFuncionario} value={profissional.idFuncionario}>{profissional.nome}</option>)}</select></label><label className="campo-formulario"><span>Data</span><input max={dataLimite()} min={dataHoje()} onChange={(evento) => definirAgendamentoEdicao({ ...agendamentoEdicao, data: evento.target.value, horario: '' })} required type="date" value={agendamentoEdicao.data} /></label><div className="grade-horarios">{horariosEdicao.map((item) => <button className={item.inicio === agendamentoEdicao.horario ? 'horario-disponivel horario-disponivel--ativo' : 'horario-disponivel'} key={item.inicio} onClick={() => definirAgendamentoEdicao({ ...agendamentoEdicao, horario: item.inicio })} type="button">{item.inicio}</button>)}</div><label className="campo-formulario"><span>Observação <small>Opcional</small></span><textarea onChange={(evento) => definirAgendamentoEdicao({ ...agendamentoEdicao, observacao: evento.target.value })} value={agendamentoEdicao.observacao} /></label><button className="botao-enviar" disabled={enviando || !agendamentoEdicao.horario} type="submit">Salvar alterações →</button></form></div>}
  </main>;
}

function dataHoje() { const data = new Date(); data.setMinutes(data.getMinutes() - data.getTimezoneOffset()); return data.toISOString().slice(0, 10); }
function dataLimite() { const data = new Date(); data.setDate(data.getDate() + 60); data.setMinutes(data.getMinutes() - data.getTimezoneOffset()); return data.toISOString().slice(0, 10); }
