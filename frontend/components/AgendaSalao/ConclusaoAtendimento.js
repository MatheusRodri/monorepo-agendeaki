'use client';

import { useState } from 'react';
import DialogoAgendamento from '../DialogoAgendamento/DialogoAgendamento';

const dinheiro = (valor) => `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;

export default function ConclusaoAtendimento({ agendamento, servicos, funcionarios, requisitar, aoFechar, aoSalvar, mostrarToastErro }) {
  const [extras, definirExtras] = useState([]);
  const [enviando, definirEnviando] = useState(false);
  const servicosFilial = servicos.filter((item) => Number(item.idUnidade) === Number(agendamento.idUnidade));
  const profissionaisServico = (idServico) => funcionarios.filter((item) => Number(item.idUnidade) === Number(agendamento.idUnidade)
    && item.idsServicos?.some((id) => Number(id) === Number(idServico)));
  const total = (Math.round(Number(agendamento.valor) * 100) + extras.reduce((valor, item) => valor + Math.round(Number(item.valorCobrado || 0) * 100), 0)) / 100;

  function atualizar(indice, alteracoes) {
    definirExtras((atuais) => atuais.map((item, atual) => atual === indice ? { ...item, ...alteracoes } : item));
  }
  function selecionarServico(indice, idServico) {
    const servico = servicosFilial.find((item) => Number(item.idServico) === Number(idServico));
    const profissionais = profissionaisServico(idServico);
    const profissional = profissionais.find((item) => Number(item.idFuncionario) === Number(agendamento.idFuncionario)) ?? profissionais[0];
    atualizar(indice, { idServico, idFuncionario: profissional ? String(profissional.idFuncionario) : '', valorCobrado: servico ? Number(servico.valor).toFixed(2) : '' });
  }
  async function confirmar(evento) {
    evento.preventDefault();
    if (enviando) return;
    definirEnviando(true);
    try {
      const resultado = await requisitar(`/agendamentos/${agendamento.idAgendamento}/confirmar-atendimento`, {
        method: 'PATCH', body: JSON.stringify({ servicosAdicionais: extras.map((item) => ({
          idServico: Number(item.idServico), idFuncionario: Number(item.idFuncionario), valorCobrado: item.valorCobrado,
        })) }),
      });
      aoFechar();
      await aoSalvar(resultado.mensagem);
    } catch (erro) { mostrarToastErro(erro.message); }
    finally { definirEnviando(false); }
  }
  return <DialogoAgendamento tituloId="titulo-concluir-atendimento" aoFechar={aoFechar} ocupado={enviando}>
    <form onSubmit={confirmar}>
      <h2 id="titulo-concluir-atendimento">Concluir atendimento</h2>
      <p>{agendamento.cliente} · {agendamento.filial}</p>
      <div className="resumo-agendamento"><strong>{agendamento.servico}</strong><span>{agendamento.funcionario} · {dinheiro(agendamento.valor)}</span></div>
      <p>Adicione outros serviços realizados durante este atendimento.</p>
      {extras.map((extra, indice) => <fieldset className="servico-adicional-formulario" key={indice}>
        <legend>Serviço extra {indice + 1}</legend>
        <label className="campo-formulario"><span>Serviço</span><select disabled={enviando} onChange={(evento) => selecionarServico(indice, evento.target.value)} required value={extra.idServico}>
          <option value="">Selecione um serviço</option>{servicosFilial.filter((item) => profissionaisServico(item.idServico).length).map((item) => <option key={item.idServico} value={item.idServico}>{item.nome} · {dinheiro(item.valor)}</option>)}
        </select></label>
        <label className="campo-formulario"><span>Profissional que realizou</span><select disabled={enviando || !extra.idServico} onChange={(evento) => atualizar(indice, { idFuncionario: evento.target.value })} required value={extra.idFuncionario}>
          <option value="">Selecione um profissional</option>{profissionaisServico(extra.idServico).map((item) => <option key={item.idFuncionario} value={item.idFuncionario}>{item.nome}</option>)}
        </select></label>
        <label className="campo-formulario"><span>Valor cobrado (R$)</span><input disabled={enviando || !extra.idServico} inputMode="decimal" max="99999999.99" min="0" onChange={(evento) => atualizar(indice, { valorCobrado: evento.target.value })} required step="0.01" type="number" value={extra.valorCobrado} /></label>
        <button aria-label={`Remover extra ${indice + 1}`} className="botao-secundario" disabled={enviando} onClick={() => definirExtras((atuais) => atuais.filter((_, atual) => atual !== indice))} type="button">Remover extra</button>
      </fieldset>)}
      <button className="botao-secundario" disabled={enviando || extras.length >= 50 || !servicosFilial.some((item) => profissionaisServico(item.idServico).length)} onClick={() => definirExtras((atuais) => [...atuais, { idServico: '', idFuncionario: '', valorCobrado: '' }])} type="button">Adicionar serviço extra</button>
      <p><strong>Total do atendimento: {dinheiro(total)}</strong></p>
      <div className="acoes-formulario"><button className="botao-secundario" disabled={enviando} onClick={aoFechar} type="button">Voltar</button><button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Confirmando...' : 'Confirmar como realizado'}</button></div>
    </form>
  </DialogoAgendamento>;
}
