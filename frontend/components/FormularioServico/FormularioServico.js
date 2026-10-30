'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PrecoServico from '../PrecoServico/PrecoServico';

const etapas = ['Serviço', 'Unidade', 'Valor e duração'];
const duracoes = [30, 45, 60, 90, 120];

export default function FormularioServico({ filiais = [], servico, enviarFormulario, aoCancelar, premiumAtivo = false, etapaInicial = 1 }) {
  const [etapa, definirEtapa] = useState(etapaInicial);
  const [nome, definirNome] = useState(servico?.nome ?? '');
  const [descricao, definirDescricao] = useState(servico?.descricao ?? '');
  const [idUnidade, definirIdUnidade] = useState(String(servico?.idUnidade ?? ''));
  const [valor, definirValor] = useState(String(servico?.valor ?? ''));
  const [duracaoMinutos, definirDuracaoMinutos] = useState(String(servico?.duracaoMinutos ?? ''));
  const [salvando, definirSalvando] = useState(false);
  const [promocaoAtiva, definirPromocaoAtiva] = useState(servico?.promocao?.ativa ?? false);
  const [promocaoTipo, definirPromocaoTipo] = useState(servico?.promocao?.tipo ?? 'PRECO_FIXO');
  const [promocaoValor, definirPromocaoValor] = useState(String(servico?.promocao?.valor ?? ''));
  const [promocaoInicio, definirPromocaoInicio] = useState(servico?.promocao?.dataInicio ?? '');
  const [promocaoFim, definirPromocaoFim] = useState(servico?.promocao?.dataFim ?? '');
  const tituloEtapa = useRef(null);
  const secaoPromocao = useRef(null);
  const etapaAnterior = useRef(etapa);
  const editando = Boolean(servico);
  const filial = filiais.find((item) => String(item.idUnidade) === idUnidade);
  const valorValido = valor.trim() !== '' && Number.isFinite(Number(valor)) && Number(valor) >= 0;
  const duracaoValida = duracoes.includes(Number(duracaoMinutos));
  const percentual = Math.round(Number(promocaoValor) * 100);
  const valorPromocional = promocaoTipo === 'PRECO_FIXO' ? Number(promocaoValor)
    : Math.round(Math.round(Number(valor) * 100) * (10000 - percentual) / 10000) / 100;
  const promocaoValida = !premiumAtivo || !promocaoAtiva || (/^\d+(?:\.\d{1,2})?$/.test(promocaoValor)
    && valorPromocional >= 0 && valorPromocional < Number(valor)
    && (promocaoTipo !== 'PERCENTUAL' || (Number(promocaoValor) > 0 && Number(promocaoValor) <= 100))
    && (!promocaoInicio || !promocaoFim || promocaoInicio <= promocaoFim));

  function removerPromocao() {
    definirPromocaoAtiva(false); definirPromocaoValor(''); definirPromocaoInicio(''); definirPromocaoFim('');
  }

  useEffect(() => {
    if (etapaAnterior.current !== etapa) tituloEtapa.current?.focus();
    etapaAnterior.current = etapa;
  }, [etapa]);

  useEffect(() => {
    if (etapaInicial !== 3) return;
    secaoPromocao.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    secaoPromocao.current?.focus({ preventScroll: true });
  }, [etapaInicial]);

  async function enviar(evento) {
    evento.preventDefault();
    if (salvando) return;
    if (etapa < 3) { definirEtapa(etapa + 1); return; }
    if (!nome.trim() || !filial || !valorValido || !duracaoValida || !promocaoValida) return;
    definirSalvando(true);
    try {
      const promocao = promocaoAtiva || promocaoValor !== '' ? { ativa: promocaoAtiva, tipo: promocaoTipo,
        valor: promocaoValor, dataInicio: promocaoInicio || null, dataFim: promocaoFim || null } : null;
      const resultado = await enviarFormulario(evento, editando ? `/servicos/${servico.idServico}` : '/servicos',
        editando ? 'PATCH' : 'POST', premiumAtivo ? { promocao } : {});
      if (resultado && !editando) {
        definirNome(''); definirDescricao(''); definirIdUnidade(''); definirValor(''); definirDuracaoMinutos(''); definirEtapa(1);
        removerPromocao(); definirPromocaoTipo('PRECO_FIXO');
      }
    } finally { definirSalvando(false); }
  }

  const resumos = [nome.trim() || 'Como se chama?', filial?.nome || 'Onde será oferecido?', valorValido && duracaoValida ? `${Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${duracaoMinutos} min` : 'Quanto custa e dura?'];

  return <form aria-label={editando ? 'Editar serviço' : 'Cadastrar serviço'} className="formulario-salao formulario-profissional formulario-servico" onSubmit={enviar}>
    <input name="nome" type="hidden" value={nome.trim()} />
    <input name="descricao" type="hidden" value={descricao.trim()} />
    <input name="idUnidade" type="hidden" value={idUnidade} />
    <input name="valor" type="hidden" value={valor} />
    <input name="duracaoMinutos" type="hidden" value={duracaoMinutos} />
    <ol aria-label="Etapas do serviço" className="profissional-etapas">
      {etapas.map((rotulo, indice) => <li key={rotulo}>
        <button aria-current={etapa === indice + 1 ? 'step' : undefined} disabled={salvando || indice + 1 > etapa} onClick={() => definirEtapa(indice + 1)} type="button">
          <span className="profissional-etapas__numero" aria-hidden="true">{indice + 1}</span>
          <span><strong>{rotulo}</strong><small>{resumos[indice]}</small></span>
        </button>
      </li>)}
    </ol>
    <div className="profissional-etapa">
      <p className="profissional-etapa__indicador">Etapa {etapa} de 3</p>
      <h2 ref={tituloEtapa} tabIndex={-1}>{['Qual serviço você oferece?', 'Em qual unidade estará disponível?', 'Qual é o valor e a duração?'][etapa - 1]}</h2>
      {etapa === 1 && <div className="formulario-servico__campos formulario-servico__campos--identidade">
        <label className="campo-formulario"><span>Nome do serviço</span><input disabled={salvando} maxLength={120} onChange={(evento) => definirNome(evento.target.value)} placeholder="Digite o nome do serviço" required value={nome} /></label>
        <label className="campo-formulario"><span>Descrição <small>Opcional</small></span><input disabled={salvando} onChange={(evento) => definirDescricao(evento.target.value)} placeholder="Conte um pouco sobre o serviço" value={descricao} /></label>
      </div>}
      {etapa === 2 && <>
        <label className="campo-formulario"><span>Unidade</span><select disabled={salvando} onChange={(evento) => definirIdUnidade(evento.target.value)} required value={idUnidade}><option value="">Selecione uma unidade</option>{filiais.map((item) => <option key={item.idUnidade} value={item.idUnidade}>{item.nome}</option>)}</select></label>
        <p className="profissional-ajuda">O serviço ficará disponível para agendamento nesta unidade.</p>
      </>}
      {etapa === 3 && <><div className="formulario-servico__campos">
        <label className="campo-formulario"><span>Valor (R$)</span><input disabled={salvando} inputMode="decimal" min="0" onChange={(evento) => definirValor(evento.target.value)} placeholder="0,00" required step="0.01" type="number" value={valor} /></label>
        <label className="campo-formulario"><span>Duração</span><select disabled={salvando} onChange={(evento) => definirDuracaoMinutos(evento.target.value)} required value={duracaoMinutos}><option value="">Selecione a duração</option>{duracoes.map((duracao) => <option key={duracao} value={duracao}>{duracao} minutos</option>)}</select></label>
      </div>
        <fieldset className="formulario-promocao" disabled={salvando} ref={secaoPromocao} tabIndex={-1}>
          <legend>Promoção <small>Premium</small></legend>
          {premiumAtivo ? <>
            <label className="formulario-promocao__ativacao"><input checked={promocaoAtiva} onChange={(evento) => definirPromocaoAtiva(evento.target.checked)} type="checkbox" /> Ativar promoção</label>
            {promocaoAtiva && <>
              <div className="formulario-servico__campos">
                <label className="campo-formulario"><span>Tipo de desconto</span><select onChange={(evento) => { definirPromocaoTipo(evento.target.value); definirPromocaoValor(''); }} value={promocaoTipo}><option value="PRECO_FIXO">Preço promocional (R$)</option><option value="PERCENTUAL">Desconto percentual (%)</option></select></label>
                <label className="campo-formulario"><span>{promocaoTipo === 'PRECO_FIXO' ? 'Preço promocional (R$)' : 'Desconto (%)'}</span><input inputMode="decimal" min={promocaoTipo === 'PRECO_FIXO' ? '0' : '0.01'} max={promocaoTipo === 'PERCENTUAL' ? '100' : undefined} onChange={(evento) => definirPromocaoValor(evento.target.value)} required step="0.01" type="number" value={promocaoValor} /></label>
                <label className="campo-formulario"><span>Início <small>Opcional</small></span><input onChange={(evento) => definirPromocaoInicio(evento.target.value)} type="date" value={promocaoInicio} /></label>
                <label className="campo-formulario"><span>Término <small>Opcional</small></span><input min={promocaoInicio || undefined} onChange={(evento) => definirPromocaoFim(evento.target.value)} type="date" value={promocaoFim} /></label>
              </div>
              {valorValido && promocaoValor !== '' && promocaoValida && <p className="formulario-promocao__previa" aria-live="polite">Prévia: <PrecoServico valor={valorPromocional} valorOriginal={valor} promocaoAtiva /></p>}
              {!promocaoValida && <p role="alert">Informe um desconto que reduza o preço e um término igual ou posterior ao início.</p>}
              <p className="profissional-ajuda">Vale para reservas confirmadas durante a promoção, mesmo com atendimento após o término. Datas seguem o horário de Brasília. Sem término, permanece até desativar.</p>
            </>}
            {(promocaoAtiva || promocaoValor !== '') && <button className="botao-secundario" onClick={removerPromocao} type="button">Remover promoção</button>}
          </> : <p className="profissional-ajuda">Promoções são um benefício Premium.{servico?.promocao?.ativa && ' Sua promoção está suspensa até recuperar o acesso.'} <Link href="/salao/assinatura">Conhecer o Premium</Link></p>}
        </fieldset>
      </>}
    </div>
    <div className="profissional-acoes">
      {etapa > 1 && <button className="botao-secundario" disabled={salvando} onClick={() => definirEtapa(etapa - 1)} type="button">Voltar</button>}
      {editando && <button className="botao-secundario" disabled={salvando} onClick={aoCancelar} type="button">Cancelar edição</button>}
      <button className="botao-enviar" disabled={salvando || (etapa === 1 && !nome.trim()) || (etapa === 2 && !filial) || (etapa === 3 && (!valorValido || !duracaoValida || !promocaoValida))} type="submit">
        {salvando ? 'Salvando...' : etapa < 3 ? 'Continuar →' : editando ? 'Salvar serviço' : 'Adicionar serviço'}
      </button>
    </div>
  </form>;
}
