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
  return <DialogoAgendamento tituloId="titulo-concluir-atendimento" aoFechar={aoFechar} ocupado={enviando} classe="modal-agendamento modal-conclusao" classeConteudo="modal-agendamento__conteudo modal-conclusao__conteudo">
    <form className="conclusao-atendimento" onSubmit={confirmar}>
      <header className="conclusao-atendimento__cabecalho">
        <div>
          <p className="conclusao-atendimento__sobretitulo">Finalizar atendimento</p>
          <h2 id="titulo-concluir-atendimento">Concluir atendimento</h2>
          <p className="conclusao-atendimento__cliente">{agendamento.cliente}<span aria-hidden="true">·</span><span>{agendamento.filial}</span></p>
        </div>
        <button aria-label="Fechar" className="conclusao-atendimento__fechar" disabled={enviando} onClick={aoFechar} type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </header>
      <div className="conclusao-atendimento__corpo">
        <section aria-labelledby="conclusao-servico-original">
          <h3 className="conclusao-atendimento__rotulo" id="conclusao-servico-original">Serviço agendado</h3>
          <div className="conclusao-servico-original">
            <span aria-hidden="true" className="conclusao-servico-original__icone"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8" /></svg></span>
            <div><strong>{agendamento.servico}</strong><span>{agendamento.funcionario}</span></div>
            <strong className="conclusao-servico-original__valor">{dinheiro(agendamento.valor)}</strong>
          </div>
        </section>
        <section aria-labelledby="conclusao-extras" className="conclusao-extras">
          <div className="conclusao-extras__cabecalho"><h3 id="conclusao-extras">Serviços extras</h3><span>Opcional</span></div>
          <p className="conclusao-atendimento__ajuda">Adicione outros serviços realizados durante este atendimento.</p>
          {!extras.length && <p className="conclusao-extras__vazio">Nenhum serviço extra adicionado.</p>}
          {extras.map((extra, indice) => <fieldset aria-label={`Serviço extra ${indice + 1}`} className="servico-adicional-formulario" key={indice}>
            <div className="conclusao-extra__cabecalho">
              <div><span aria-hidden="true" className="conclusao-extra__numero">{String(indice + 1).padStart(2, '0')}</span><strong>Serviço adicional</strong></div>
              <button aria-label={`Remover extra ${indice + 1}`} className="botao-secundario conclusao-extra__remover" disabled={enviando} onClick={() => definirExtras((atuais) => atuais.filter((_, atual) => atual !== indice))} type="button">Remover extra</button>
            </div>
            <div className="conclusao-extra__campos">
              <label className="campo-formulario conclusao-extra__servico"><span>Serviço</span><select disabled={enviando} onChange={(evento) => selecionarServico(indice, evento.target.value)} required value={extra.idServico}>
                <option value="">Selecione um serviço</option>{servicosFilial.filter((item) => profissionaisServico(item.idServico).length).map((item) => <option key={item.idServico} value={item.idServico}>{item.nome} · {dinheiro(item.valor)}</option>)}
              </select></label>
              <label className="campo-formulario"><span>Profissional que realizou</span><select disabled={enviando || !extra.idServico} onChange={(evento) => atualizar(indice, { idFuncionario: evento.target.value })} required value={extra.idFuncionario}>
                <option value="">Selecione um profissional</option>{profissionaisServico(extra.idServico).map((item) => <option key={item.idFuncionario} value={item.idFuncionario}>{item.nome}</option>)}
              </select></label>
              <label className="campo-formulario"><span>Valor cobrado (R$)</span><input disabled={enviando || !extra.idServico} inputMode="decimal" max="99999999.99" min="0" onChange={(evento) => atualizar(indice, { valorCobrado: evento.target.value })} required step="0.01" type="number" value={extra.valorCobrado} /></label>
            </div>
          </fieldset>)}
          <button className="botao-secundario conclusao-extras__adicionar" disabled={enviando || extras.length >= 50 || !servicosFilial.some((item) => profissionaisServico(item.idServico).length)} onClick={() => definirExtras((atuais) => [...atuais, { idServico: '', idFuncionario: '', valorCobrado: '' }])} type="button"><span aria-hidden="true">+</span> Adicionar serviço extra</button>
        </section>
      </div>
      <footer className="conclusao-atendimento__rodape">
        <div aria-live="polite" aria-atomic="true" className="conclusao-total"><div><span>Total do atendimento</span><small>{extras.length ? `Serviço agendado + ${extras.length} extra${extras.length === 1 ? '' : 's'}` : 'Somente o serviço agendado'}</small></div><strong>{dinheiro(total)}</strong></div>
        <div className="conclusao-atendimento__acoes"><button className="botao-secundario" disabled={enviando} onClick={aoFechar} type="button">Voltar</button><button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Confirmando...' : 'Confirmar como realizado'}</button></div>
      </footer>
    </form>
  </DialogoAgendamento>;
}
