'use client';

import { useEffect, useState } from 'react';
import { requisitarApi } from '../../utils/api';
import { obterTokenAcesso } from '../../utils/respostaApi';

export function servicoRepetidoNaData(itens, item) {
  return Boolean(item.data && itens.some((outro) => outro.chave !== item.chave
    && String(outro.idServico) === String(item.idServico) && outro.data === item.data));
}

export function horarioDefinido(item) {
  return Boolean(item.data && item.horario && item.fim && item.profissional?.idFuncionario);
}

export default function HorarioServico({ item, itens, servico, idUnidade, slugSalao, slugFilial, dataMinima, dataMaxima, aoAlterar, aoConcluir, temProximo }) {
  const [consulta, definirConsulta] = useState({ horarios: [], mensagem: '', carregando: false });
  const repetido = servicoRepetidoNaData(itens, item);
  const ocupacoes = JSON.stringify(itens.filter((outro) => outro.chave !== item.chave && horarioDefinido(outro))
    .map(({ data, horario, fim }) => ({ data, horario, fim })));
  const chaveConsulta = `${item.data}:${item.idFuncionario}:${item.idServico}:${ocupacoes}`;
  const horarios = consulta.chave === chaveConsulta ? consulta.horarios : [];

  useEffect(() => {
    if (!item.data || !item.idFuncionario || repetido) return;
    let ativo = true;
    definirConsulta({ chave: chaveConsulta, horarios: [], mensagem: 'Consultando horários disponíveis...', carregando: true });
    const caminho = obterTokenAcesso('cliente') ? '/api/clientes/agendamentos/horarios'
      : `/api/publico/agendamento/${slugSalao}/${slugFilial}/horarios`;
    requisitarApi(caminho, { parametros: { data: item.data, idFuncionario: item.idFuncionario, idServico: item.idServico, idUnidade } })
      .then((dados) => {
        if (!ativo) return;
        const outros = JSON.parse(ocupacoes);
        const disponiveis = dados.horarios.filter((opcao) => !outros.some((outro) => outro.data === item.data && opcao.inicio < outro.fim && opcao.fim > outro.horario));
        definirConsulta({ chave: chaveConsulta, horarios: disponiveis, mensagem: disponiveis.length ? '' : 'Não há horários livres nesta data. Escolha outro dia ou profissional.', carregando: false });
      })
      .catch((erro) => { if (ativo) definirConsulta({ chave: chaveConsulta, horarios: [], mensagem: erro.message, carregando: false }); });
    return () => { ativo = false; };
  }, [chaveConsulta, idUnidade, item.data, item.idFuncionario, item.idServico, ocupacoes, repetido, slugFilial, slugSalao]);

  function alterarPreferencia(alteracoes) {
    aoAlterar({ ...alteracoes, horario: '', fim: '', profissional: null });
  }

  return <div className="escolha-horario-servico">
    <div className="escolha-horario-servico__campos">
      <label className="campo-formulario"><span>Profissional</span><select onChange={(evento) => alterarPreferencia({ idFuncionario: evento.target.value })} value={item.idFuncionario}>
        <option value="qualquer">Sem preferência</option>
        {servico?.profissionais.map((profissional) => <option key={profissional.idFuncionario} value={profissional.idFuncionario}>{profissional.nome}</option>)}
      </select></label>
      <label className="campo-formulario"><span>Data do atendimento</span><input aria-invalid={repetido || undefined} aria-describedby={repetido ? `data-repetida-${item.chave}` : undefined} max={dataMaxima} min={dataMinima} onChange={(evento) => alterarPreferencia({ data: evento.target.value })} type="date" value={item.data} /></label>
    </div>
    {repetido && <p className="aviso-horario-servico" id={`data-repetida-${item.chave}`} role="alert">Este serviço já foi escolhido para este dia. Selecione outra data.</p>}
    {item.data && !repetido && <fieldset className="escolha-horario-servico__horarios"><legend>Horários disponíveis</legend>
      <div className="grade-horarios">{horarios.map((opcao) => <button aria-pressed={opcao.inicio === item.horario} className={opcao.inicio === item.horario ? 'horario-disponivel horario-disponivel--ativo' : 'horario-disponivel'} key={opcao.inicio} onClick={() => aoAlterar({ horario: opcao.inicio, fim: opcao.fim, profissional: opcao.profissionalSugerido })} type="button">{opcao.inicio}</button>)}</div>
      {consulta.chave === chaveConsulta && consulta.mensagem && <p className="aviso-horario-servico" role="status">{consulta.mensagem}</p>}
      {item.horario && horarios.some((opcao) => opcao.inicio === item.horario) && <p className="escolha-horario-servico__atribuicao">Com <strong>{item.profissional?.nome}</strong> · {item.horario} às {item.fim}</p>}
    </fieldset>}
    {horarioDefinido(item) && <label className="campo-formulario"><span>Observação <small>Opcional</small></span><textarea maxLength="500" onChange={(evento) => aoAlterar({ observacao: evento.target.value })} placeholder="Algo que o profissional precisa saber?" rows={2} value={item.observacao} /></label>}
    <div className="escolha-horario-servico__acoes"><button className="botao-enviar" disabled={repetido || !item.horario || !horarios.some((opcao) => opcao.inicio === item.horario)} onClick={aoConcluir} type="button">{temProximo ? 'Próximo serviço →' : 'Salvar horário'}</button></div>
  </div>;
}
