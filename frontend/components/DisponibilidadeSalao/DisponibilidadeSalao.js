'use client';

import { useEffect, useMemo, useState } from 'react';
import { toastSucesso } from '../../utils/toast';

const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const edicaoPadrao = { ativo: true, fim: '18:00', inicio: '09:00', pausaAtiva: false, pausaFim: '13:00', pausaInicio: '12:00' };
const opcoesMotivoBloqueio = [
  ['BLOQUEIO_AGENDA', 'Bloqueio emergencial da agenda pelo salão'],
  ['INDISPONIBILIDADE_PROFISSIONAL', 'Indisponibilidade do profissional'],
  ['SOLICITACAO_CLIENTE', 'Solicitação do cliente'],
  ['PROBLEMA_UNIDADE', 'Problema na unidade'],
  ['ERRO_AGENDAMENTO', 'Erro no agendamento'],
  ['OUTRO', 'Outro motivo'],
];

export default function DisponibilidadeSalao({ filiais = [], mostrarToastErro, requisitar }) {
  const [idUnidade, definirIdUnidade] = useState(String(filiais[0]?.idUnidade ?? ''));
  const [dados, definirDados] = useState({ bloqueios: [], funcionarios: [] });
  const [idFuncionario, definirIdFuncionario] = useState('');
  const [periodos, definirPeriodos] = useState([]);
  const [codigoMotivoBloqueio, definirCodigoMotivoBloqueio] = useState('BLOQUEIO_AGENDA');
  const [detalheMotivoBloqueio, definirDetalheMotivoBloqueio] = useState('');
  const [diaEmEdicao, definirDiaEmEdicao] = useState(null);
  const [edicaoDia, definirEdicaoDia] = useState(edicaoPadrao);

  async function carregar(unidade = idUnidade) {
    if (!unidade) return;
    try { definirDados(await requisitar(`/disponibilidade?idUnidade=${unidade}`)); }
    catch (erro) { mostrarToastErro(erro.message); }
  }

  useEffect(() => { carregar(idUnidade); }, [idUnidade]);
  const funcionario = useMemo(() => dados.funcionarios.find((item) => String(item.idFuncionario) === idFuncionario), [dados.funcionarios, idFuncionario]);
  useEffect(() => {
    definirPeriodos(funcionario?.periodos?.map((item) => ({ diaSemana: Number(item.diaSemana), fim: String(item.fim).slice(0, 5), inicio: String(item.inicio).slice(0, 5) })) ?? []);
    definirDiaEmEdicao(null);
  }, [funcionario]);

  function periodosDoDia(diaSemana) {
    return periodos.filter((periodo) => periodo.diaSemana === diaSemana).sort((a, b) => a.inicio.localeCompare(b.inicio));
  }

  function editarDia(diaSemana) {
    const periodosAtuais = periodosDoDia(diaSemana);
    if (!periodosAtuais.length) definirEdicaoDia({ ...edicaoPadrao, ativo: false });
    else definirEdicaoDia({
      ativo: true,
      fim: periodosAtuais.at(-1).fim,
      inicio: periodosAtuais[0].inicio,
      pausaAtiva: periodosAtuais.length > 1,
      pausaFim: periodosAtuais[1]?.inicio ?? '13:00',
      pausaInicio: periodosAtuais.length > 1 ? periodosAtuais[0].fim : '12:00',
    });
    definirDiaEmEdicao(diaSemana);
  }

  function aplicarEdicaoDia() {
    if (!edicaoDia.ativo) {
      definirPeriodos((atuais) => atuais.filter((periodo) => periodo.diaSemana !== diaEmEdicao));
      definirDiaEmEdicao(null);
      return;
    }
    if (edicaoDia.inicio >= edicaoDia.fim) { mostrarToastErro('O início da jornada precisa ser anterior ao fim.'); return; }
    if (edicaoDia.pausaAtiva && !(edicaoDia.inicio < edicaoDia.pausaInicio && edicaoDia.pausaInicio < edicaoDia.pausaFim && edicaoDia.pausaFim < edicaoDia.fim)) {
      mostrarToastErro('A pausa precisa ficar dentro da jornada e ter início anterior ao fim.');
      return;
    }
    const novosPeriodos = edicaoDia.pausaAtiva
      ? [
        { diaSemana: diaEmEdicao, inicio: edicaoDia.inicio, fim: edicaoDia.pausaInicio },
        { diaSemana: diaEmEdicao, inicio: edicaoDia.pausaFim, fim: edicaoDia.fim },
      ]
      : [{ diaSemana: diaEmEdicao, inicio: edicaoDia.inicio, fim: edicaoDia.fim }];
    definirPeriodos((atuais) => [...atuais.filter((periodo) => periodo.diaSemana !== diaEmEdicao), ...novosPeriodos]
      .sort((a, b) => a.diaSemana - b.diaSemana || a.inicio.localeCompare(b.inicio)));
    definirDiaEmEdicao(null);
  }

  async function salvarPeriodos() {
    try {
      const resultado = await requisitar(`/funcionarios/${idFuncionario}/disponibilidade`, { method: 'PUT', body: JSON.stringify({ periodos }) });
      toastSucesso(resultado.mensagem); await carregar();
    } catch (erro) { mostrarToastErro(erro.message); }
  }

  async function criarBloqueio(evento) {
    evento.preventDefault();
    if (!window.confirm('Os agendamentos confirmados que coincidirem com este período serão cancelados. Deseja continuar?')) return;
    const elementoFormulario = evento.currentTarget;
    const formulario = new FormData(elementoFormulario);
    try {
      const resultado = await requisitar('/bloqueios', { method: 'POST', body: JSON.stringify({ ...Object.fromEntries(formulario), idUnidade }) });
      toastSucesso(resultado.mensagem); elementoFormulario.reset(); definirCodigoMotivoBloqueio('BLOQUEIO_AGENDA'); definirDetalheMotivoBloqueio(''); await carregar();
    } catch (erro) { mostrarToastErro(erro.message); }
  }

  async function removerBloqueio(idBloqueio) {
    try { const resultado = await requisitar(`/bloqueios/${idBloqueio}`, { method: 'DELETE' }); toastSucesso(resultado.mensagem); await carregar(); }
    catch (erro) { mostrarToastErro(erro.message); }
  }

  return <><p className="sobretitulo">Organização da agenda</p><h1>Disponibilidade.</h1>
    <label className="campo-formulario seletor-disponibilidade"><span>Filial</span><select onChange={(evento) => { definirIdUnidade(evento.target.value); definirIdFuncionario(''); }} value={idUnidade}><option value="">Selecione</option>{filiais.map((item) => <option key={item.idUnidade} value={item.idUnidade}>{item.nome}</option>)}</select></label>

    {idUnidade && <section className="secao-painel"><h2>Jornada dos profissionais</h2><p className="descricao-secao">Edite cada dia e, quando necessário, informe o intervalo de almoço ou outra pausa.</p><label className="campo-formulario seletor-disponibilidade"><span>Profissional</span><select onChange={(evento) => definirIdFuncionario(evento.target.value)} value={idFuncionario}><option value="">Selecione</option>{dados.funcionarios.map((item) => <option key={item.idFuncionario} value={item.idFuncionario}>{item.nome}</option>)}</select></label>
      {idFuncionario && <div className="editor-disponibilidade"><div className="lista-periodos lista-jornada-semanal">{dias.map((dia, diaSemana) => <LinhaJornada dia={dia} edicao={edicaoDia} emEdicao={diaEmEdicao === diaSemana} key={dia} periodos={periodosDoDia(diaSemana)} aoAlterarEdicao={definirEdicaoDia} aoAplicar={aplicarEdicaoDia} aoCancelar={() => definirDiaEmEdicao(null)} aoEditar={() => editarDia(diaSemana)} />)}</div><button className="botao-enviar" onClick={salvarPeriodos} type="button">Salvar jornada →</button></div>}
    </section>}
    {idUnidade && <section className="secao-painel"><h2>Bloquear agenda</h2><p className="descricao-secao">Use para imprevistos, folgas ou férias. Os agendamentos confirmados dentro do período serão cancelados. Deixe o profissional vazio para bloquear toda a filial.</p><form className="formulario-salao grade-formulario" onSubmit={criarBloqueio}><label className="campo-formulario"><span>Profissional <small>Opcional</small></span><select name="idFuncionario"><option value="">Toda a filial</option>{dados.funcionarios.map((item) => <option key={item.idFuncionario} value={item.idFuncionario}>{item.nome}</option>)}</select></label><CampoDataHora nome="dataHoraInicio" rotulo="Início" /><CampoDataHora nome="dataHoraFim" rotulo="Fim" /><label className="campo-formulario"><span>Motivo do bloqueio</span><select name="codigoMotivo" onChange={(evento) => { definirCodigoMotivoBloqueio(evento.target.value); definirDetalheMotivoBloqueio(''); }} required value={codigoMotivoBloqueio}>{opcoesMotivoBloqueio.map(([codigo, rotulo]) => <option key={codigo} value={codigo}>{rotulo}</option>)}</select></label>{codigoMotivoBloqueio === 'OUTRO' && <label className="campo-formulario"><span>Descreva o motivo</span><input maxLength="200" name="detalheMotivo" onChange={(evento) => definirDetalheMotivoBloqueio(evento.target.value)} required value={detalheMotivoBloqueio} /></label>}<button className="botao-enviar">Bloquear e cancelar conflitos →</button></form><div className="grade-gestao lista-bloqueios">{dados.bloqueios.map((item) => <article className="cartao-gestao" key={item.idBloqueio}><div><strong>{item.profissional || 'Toda a filial'}</strong><span>{formatarDataHora(item.dataHoraInicio)} até {formatarDataHora(item.dataHoraFim)}</span><small>{item.motivo || 'Sem motivo informado'}</small></div><button className="botao-secundario" onClick={() => removerBloqueio(item.idBloqueio)} type="button">Remover</button></article>)}</div></section>}
  </>;
}

function LinhaJornada({ aoAlterarEdicao, aoAplicar, aoCancelar, aoEditar, dia, edicao, emEdicao, periodos }) {
  if (emEdicao) return <div className="linha-jornada linha-jornada--editando"><div className="linha-jornada__cabecalho"><strong>{dia}</strong><label><input checked={edicao.ativo} onChange={(evento) => aoAlterarEdicao({ ...edicao, ativo: evento.target.checked })} type="checkbox" /> Trabalha neste dia</label></div>{edicao.ativo && <div className="linha-jornada__campos"><label><span>Entrada</span><input onChange={(evento) => aoAlterarEdicao({ ...edicao, inicio: evento.target.value })} type="time" value={edicao.inicio} /></label><label><span>Saída</span><input onChange={(evento) => aoAlterarEdicao({ ...edicao, fim: evento.target.value })} type="time" value={edicao.fim} /></label><label className="linha-jornada__alternador-pausa"><input checked={edicao.pausaAtiva} onChange={(evento) => aoAlterarEdicao({ ...edicao, pausaAtiva: evento.target.checked })} type="checkbox" /> Possui pausa</label>{edicao.pausaAtiva && <><label><span>Início da pausa</span><input onChange={(evento) => aoAlterarEdicao({ ...edicao, pausaInicio: evento.target.value })} type="time" value={edicao.pausaInicio} /></label><label><span>Fim da pausa</span><input onChange={(evento) => aoAlterarEdicao({ ...edicao, pausaFim: evento.target.value })} type="time" value={edicao.pausaFim} /></label></>}</div>}<div className="linha-jornada__acoes"><button className="acao-editar-periodo" onClick={aoAplicar} type="button">Aplicar</button><button onClick={aoCancelar} type="button">Cancelar</button></div></div>;

  const primeiro = periodos[0];
  const ultimo = periodos.at(-1);
  const pausas = periodos.slice(0, -1).map((periodo, indice) => `${periodo.fim}–${periodos[indice + 1].inicio}`);
  return <div className="linha-jornada"><span>{dia}</span><div className="linha-jornada__resumo">{periodos.length ? <><strong>{primeiro.inicio}–{ultimo.fim}</strong>{pausas.length > 0 && <small>Pausa {pausas.join(' · ')}</small>}</> : <strong>Não trabalha</strong>}</div><button className="acao-editar-periodo" onClick={aoEditar} type="button">Editar</button></div>;
}

function CampoDataHora({ nome, rotulo }) { return <label className="campo-formulario"><span>{rotulo}</span><input name={nome} required type="datetime-local" /></label>; }
function formatarDataHora(valor) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor)); }
