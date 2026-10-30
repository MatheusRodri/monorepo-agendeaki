'use client';

import { useEffect, useId, useState } from 'react';
import IconeDashboard from './IconeDashboard';

export const filtrosVazios = { dataInicio: '', dataFim: '', idUnidade: '', idServico: '', idFuncionario: '', promocao: 'todas', ajusteValor: 'todos' };
export const filtrosPrecos = [
  ['promocao', 'Promoção', [['todas', 'Todas'], ['com', 'Com promoção'], ['sem', 'Sem promoção'], ['naoInformado', 'Não informado']], 'desconto'],
  ['ajusteValor', 'Ajuste de valor', [['todos', 'Todos'], ['desconto', 'Com desconto adicional'], ['acrescimo', 'Com acréscimo'], ['sem', 'Sem ajuste'], ['naoInformado', 'Não informado']], 'ajustes'],
];

const dataLegivel = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor ?? '') ? valor.split('-').reverse().join('/') : '—';

export default function FiltrosDashboard({ filtros, aoAplicar, opcoes, carregando, compacto = false, periodo = filtros, children }) {
  const [expandido, definirExpandido] = useState(false);
  const idFormulario = useId();
  const [rascunho, definirRascunho] = useState({ ...filtrosVazios, ...filtros });
  useEffect(() => { definirRascunho({ ...filtrosVazios, ...filtros }); }, [filtros]);
  function alterar(campo, valor) {
    const proximos = { ...rascunho, [campo]: valor };
    definirRascunho(proximos);
    if (campo === 'dataInicio' || campo === 'dataFim') {
      // Durante a digitação, aguarda um intervalo completo e em ordem.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(proximos.dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(proximos.dataFim)
        || proximos.dataInicio > proximos.dataFim) return;
      aoAplicar({ ...filtros, dataInicio: proximos.dataInicio, dataFim: proximos.dataFim });
      return;
    }
    aoAplicar({ ...filtros, [campo]: valor });
  }

  function limpar() {
    definirRascunho(filtrosVazios);
    aoAplicar(filtrosVazios);
  }

  const quantidadeAtivos = ['idUnidade', 'idServico', 'idFuncionario'].filter((campo) => filtros[campo]).length
    + (filtros.promocao && filtros.promocao !== 'todas' ? 1 : 0)
    + (filtros.ajusteValor && filtros.ajusteValor !== 'todos' ? 1 : 0);
  return <div className={`dashboard-filtros-painel${compacto ? ' dashboard-filtros-painel--compacto' : ''}`}>
    <div className="dashboard-filtros__barra">{compacto && children}<div className="dashboard-filtros__atalhos">{compacto && <button className="dashboard-filtros__data" aria-controls={idFormulario} aria-expanded={expandido} aria-label="Alterar período dos indicadores, horário de São Paulo" onClick={() => definirExpandido((atual) => !atual)} type="button"><IconeDashboard nome="calendario" />{dataLegivel(periodo?.dataInicio)} – {dataLegivel(periodo?.dataFim)}<span aria-hidden="true" className="dashboard-filtros__seta" /></button>}<button aria-controls={idFormulario} aria-expanded={expandido} className="dashboard-filtros__alternar" onClick={() => definirExpandido((atual) => !atual)} type="button"><IconeDashboard nome="filtro" />Filtros{quantidadeAtivos > 0 && <span className="dashboard-filtros__contador">{quantidadeAtivos}<span className="visualmente-oculto"> filtros ativos</span></span>}<span aria-hidden="true" className={`dashboard-filtros__seta${expandido ? ' dashboard-filtros__seta--aberta' : ''}`} /></button></div></div>
    <form aria-label="Filtros do dashboard" aria-busy={carregando} className="dashboard-filtros" hidden={!expandido} id={idFormulario} onSubmit={(evento) => evento.preventDefault()}>
    <fieldset className="dashboard-filtros__periodo">
      <legend>Período</legend>
      <div className="dashboard-filtros__intervalo"><IconeDashboard nome="calendario" />
        <input aria-label="Data inicial" max={rascunho.dataFim || undefined} onChange={(evento) => alterar('dataInicio', evento.target.value)} required type="date" value={rascunho.dataInicio} />
        <span aria-hidden="true">—</span>
        <input aria-label="Data final" min={rascunho.dataInicio || undefined} onChange={(evento) => alterar('dataFim', evento.target.value)} required type="date" value={rascunho.dataFim} />
      </div>
    </fieldset>
    {[
      ['idUnidade', 'Unidade', 'filiais', 'unidade'],
      ['idServico', 'Serviço', 'servicos', 'servicos'],
      ['idFuncionario', 'Profissional', 'funcionarios', 'pessoa'],
    ].map(([campo, rotulo, lista, icone]) => <label className="dashboard-filtros__campo" key={campo}>
      <span>{rotulo}</span><div className="dashboard-filtros__controle"><IconeDashboard nome={icone} /><select onChange={(evento) => alterar(campo, evento.target.value)} value={rascunho[campo]}><option value="">Todos</option>{opcoes?.[lista]?.map((item) => <option key={item[campo]} value={item[campo]}>{item.nome}</option>)}</select></div>
    </label>)}
    {filtrosPrecos.map(([campo, rotulo, valores, icone]) => <label className="dashboard-filtros__campo" key={campo}>
      <span>{rotulo}</span><div className="dashboard-filtros__controle"><IconeDashboard nome={icone} /><select onChange={(evento) => alterar(campo, evento.target.value)} title={valores.find(([valor]) => valor === rascunho[campo])?.[1]} value={rascunho[campo]}>{valores.map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}</select></div>
    </label>)}
    <div className="dashboard-filtros__acoes"><button className="dashboard-filtros__limpar" onClick={limpar} type="button">Limpar filtros</button></div>
    </form>
    {!compacto && children}
  </div>;
}
