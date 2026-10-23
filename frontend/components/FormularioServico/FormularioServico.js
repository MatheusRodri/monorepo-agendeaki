'use client';

import { useEffect, useRef, useState } from 'react';

const etapas = ['Serviço', 'Filial', 'Valor e duração'];
const duracoes = [30, 45, 60, 90, 120];

export default function FormularioServico({ filiais = [], servico, enviarFormulario, aoCancelar }) {
  const [etapa, definirEtapa] = useState(1);
  const [nome, definirNome] = useState(servico?.nome ?? '');
  const [descricao, definirDescricao] = useState(servico?.descricao ?? '');
  const [idUnidade, definirIdUnidade] = useState(String(servico?.idUnidade ?? ''));
  const [valor, definirValor] = useState(String(servico?.valor ?? ''));
  const [duracaoMinutos, definirDuracaoMinutos] = useState(String(servico?.duracaoMinutos ?? ''));
  const [salvando, definirSalvando] = useState(false);
  const tituloEtapa = useRef(null);
  const etapaAnterior = useRef(etapa);
  const editando = Boolean(servico);
  const filial = filiais.find((item) => String(item.idUnidade) === idUnidade);
  const valorValido = valor.trim() !== '' && Number.isFinite(Number(valor)) && Number(valor) >= 0;
  const duracaoValida = duracoes.includes(Number(duracaoMinutos));

  useEffect(() => {
    if (etapaAnterior.current !== etapa) tituloEtapa.current?.focus();
    etapaAnterior.current = etapa;
  }, [etapa]);

  async function enviar(evento) {
    evento.preventDefault();
    if (salvando) return;
    if (etapa < 3) { definirEtapa(etapa + 1); return; }
    if (!nome.trim() || !filial || !valorValido || !duracaoValida) return;
    definirSalvando(true);
    try {
      const resultado = await enviarFormulario(evento, editando ? `/servicos/${servico.idServico}` : '/servicos', editando ? 'PATCH' : 'POST');
      if (resultado && !editando) {
        definirNome(''); definirDescricao(''); definirIdUnidade(''); definirValor(''); definirDuracaoMinutos(''); definirEtapa(1);
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
      <h2 ref={tituloEtapa} tabIndex={-1}>{['Qual serviço você oferece?', 'Em qual filial estará disponível?', 'Qual é o valor e a duração?'][etapa - 1]}</h2>
      {etapa === 1 && <div className="formulario-servico__campos formulario-servico__campos--identidade">
        <label className="campo-formulario"><span>Nome do serviço</span><input disabled={salvando} maxLength={120} onChange={(evento) => definirNome(evento.target.value)} placeholder="Digite o nome do serviço" required value={nome} /></label>
        <label className="campo-formulario"><span>Descrição <small>Opcional</small></span><input disabled={salvando} onChange={(evento) => definirDescricao(evento.target.value)} placeholder="Conte um pouco sobre o serviço" value={descricao} /></label>
      </div>}
      {etapa === 2 && <>
        <label className="campo-formulario"><span>Filial</span><select disabled={salvando} onChange={(evento) => definirIdUnidade(evento.target.value)} required value={idUnidade}><option value="">Selecione uma filial</option>{filiais.map((item) => <option key={item.idUnidade} value={item.idUnidade}>{item.nome}</option>)}</select></label>
        <p className="profissional-ajuda">O serviço ficará disponível para agendamento nesta filial.</p>
      </>}
      {etapa === 3 && <div className="formulario-servico__campos">
        <label className="campo-formulario"><span>Valor (R$)</span><input disabled={salvando} inputMode="decimal" min="0" onChange={(evento) => definirValor(evento.target.value)} placeholder="0,00" required step="0.01" type="number" value={valor} /></label>
        <label className="campo-formulario"><span>Duração</span><select disabled={salvando} onChange={(evento) => definirDuracaoMinutos(evento.target.value)} required value={duracaoMinutos}><option value="">Selecione a duração</option>{duracoes.map((duracao) => <option key={duracao} value={duracao}>{duracao} minutos</option>)}</select></label>
      </div>}
    </div>
    <div className="profissional-acoes">
      {etapa > 1 && <button className="botao-secundario" disabled={salvando} onClick={() => definirEtapa(etapa - 1)} type="button">Voltar</button>}
      {editando && <button className="botao-secundario" disabled={salvando} onClick={aoCancelar} type="button">Cancelar edição</button>}
      <button className="botao-enviar" disabled={salvando || (etapa === 1 && !nome.trim()) || (etapa === 2 && !filial) || (etapa === 3 && (!valorValido || !duracaoValida))} type="submit">
        {salvando ? 'Salvando...' : etapa < 3 ? 'Continuar →' : editando ? 'Salvar serviço' : 'Adicionar serviço'}
      </button>
    </div>
  </form>;
}
