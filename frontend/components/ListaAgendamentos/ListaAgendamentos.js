'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CabecalhoCliente from '../CabecalhoCliente/CabecalhoCliente';
import { requisitarApi } from '../../utils/api';

export default function ListaAgendamentos() {
  const [filtro, definirFiltro] = useState('futuros');
  const [agendamentos, definirAgendamentos] = useState([]);
  const [mensagem, definirMensagem] = useState('Carregando seus agendamentos...');
  const [tipoMensagem, definirTipoMensagem] = useState('sucesso');
  const [agendamentoEdicao, definirAgendamentoEdicao] = useState(null);
  const [servicos, definirServicos] = useState([]);
  const [enviando, definirEnviando] = useState(false);
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
    } catch (erro) { definirAgendamentos([]); definirMensagem(erro.message); definirTipoMensagem('erro'); }
  }

  useEffect(() => { buscarAgendamentos(); }, [filtro]);

  async function cancelarAgendamento(agendamento) {
    if (!window.confirm(`Cancelar o agendamento de ${agendamento.servico}?`)) return;
    definirEnviando(true);
    try {
      const dados = await requisitar(`/agendamentos/${agendamento.idAgendamento}/cancelar`, { method: 'PATCH' });
      definirMensagem(dados.mensagem); definirTipoMensagem('sucesso'); definirFiltro('historico');
    } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); } finally { definirEnviando(false); }
  }

  async function abrirEdicao(agendamento) {
    try {
      const dados = await requisitar(`/saloes/${agendamento.idUnidade}/servicos`);
      definirServicos(dados.servicos);
      definirAgendamentoEdicao({ ...agendamento, dataHoraInicio: new Date(agendamento.dataHoraInicio).toISOString().slice(0, 16), observacao: agendamento.observacao ?? '' });
    } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); }
  }

  async function salvarEdicao(evento) {
    evento.preventDefault();
    definirEnviando(true);
    try {
      const dados = await requisitar(`/agendamentos/${agendamentoEdicao.idAgendamento}`, { method: 'PATCH', body: JSON.stringify(agendamentoEdicao) });
      definirMensagem(dados.mensagem); definirTipoMensagem('sucesso'); definirAgendamentoEdicao(null); buscarAgendamentos();
    } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); } finally { definirEnviando(false); }
  }

  const servicoEdicao = servicos.find((servico) => Number(servico.idServico) === Number(agendamentoEdicao?.idServico));

  return <main className="pagina-agendamentos">
    <CabecalhoCliente secao="agendamentos" />
    <section className="conteudo-agendamentos conteudo-limitado"><p className="sobretitulo">Sua agenda</p><h1>Seus momentos de cuidado.</h1><div className="filtro-agendamentos" role="group" aria-label="Filtro de agendamentos"><button className={futuros ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirFiltro('futuros')} type="button">Próximos horários</button><button className={!futuros ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirFiltro('historico')} type="button">Histórico</button></div>{mensagem && <p className={`mensagem-formulario mensagem-formulario--${tipoMensagem}`}>{mensagem}</p>}<div className="lista-agendamentos">{agendamentos.map((agendamento) => <article className="cartao-agendamento-lista" key={agendamento.idAgendamento}><span className="data-agendamento">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(agendamento.dataHoraInicio))}</span><div><span className={`status-agendamento status-agendamento--${agendamento.status.toLowerCase()}`}>{agendamento.status.toLowerCase()}</span><h2>{agendamento.servico}</h2><p>{agendamento.salao} · {agendamento.unidade}, {agendamento.municipio}</p><small>Com {agendamento.profissional} · {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(agendamento.dataHoraInicio))}</small>{agendamento.observacao && <small className="observacao-agendamento">Observação: {agendamento.observacao}</small>}</div><div className="acoes-agendamento"><strong>R$ {Number(agendamento.valor).toFixed(2).replace('.', ',')}</strong>{futuros && <><button disabled={enviando} onClick={() => abrirEdicao(agendamento)} type="button">Editar</button><button className="acao-perigosa" disabled={enviando} onClick={() => cancelarAgendamento(agendamento)} type="button">Cancelar</button></>}</div></article>)}</div></section>
    {agendamentoEdicao && <div className="modal-agendamento" role="dialog" aria-modal="true"><form className="formulario-agendamento modal-agendamento__conteudo" onSubmit={salvarEdicao}><button aria-label="Fechar" className="modal-agendamento__fechar" onClick={() => definirAgendamentoEdicao(null)} type="button">×</button><p className="sobretitulo">Ajuste seu horário</p><h2>Editar agendamento</h2><label className="campo-formulario"><span>Data e horário</span><input min={new Date().toISOString().slice(0, 16)} onChange={(evento) => definirAgendamentoEdicao({ ...agendamentoEdicao, dataHoraInicio: evento.target.value })} required type="datetime-local" value={agendamentoEdicao.dataHoraInicio} /></label><label className="campo-formulario"><span>Serviço</span><select onChange={(evento) => { const idServico = Number(evento.target.value); definirAgendamentoEdicao({ ...agendamentoEdicao, idServico, idFuncionario: '' }); }} value={agendamentoEdicao.idServico}>{servicos.map((servico) => <option key={servico.idServico} value={servico.idServico}>{servico.nome}</option>)}</select></label><label className="campo-formulario"><span>Profissional</span><select onChange={(evento) => definirAgendamentoEdicao({ ...agendamentoEdicao, idFuncionario: Number(evento.target.value) })} required value={agendamentoEdicao.idFuncionario}>{servicoEdicao?.profissionais.map((profissional) => <option key={profissional.idFuncionario} value={profissional.idFuncionario}>{profissional.nome}</option>)}</select></label><label className="campo-formulario"><span>Observação <small>Opcional</small></span><textarea onChange={(evento) => definirAgendamentoEdicao({ ...agendamentoEdicao, observacao: evento.target.value })} value={agendamentoEdicao.observacao} /></label><button className="botao-enviar" disabled={enviando} type="submit">Salvar alterações →</button></form></div>}
  </main>;
}
