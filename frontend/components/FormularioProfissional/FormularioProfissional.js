'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const etapas = ['Nome', 'Filial', 'Serviços'];

export default function FormularioProfissional({ filiais = [], servicos = [], profissional, enviarFormulario, aoCancelar }) {
  const [etapa, definirEtapa] = useState(1);
  const [nome, definirNome] = useState(profissional?.nome ?? '');
  const [idUnidade, definirIdUnidade] = useState(String(profissional?.idUnidade ?? ''));
  const [idsServicos, definirIdsServicos] = useState(() => (profissional?.idsServicos ?? []).map(String));
  const [salvando, definirSalvando] = useState(false);
  const tituloEtapa = useRef(null);
  const etapaAnterior = useRef(etapa);
  const editando = Boolean(profissional);
  const servicosFilial = servicos.filter((servico) => String(servico.idUnidade) === idUnidade);
  const selecionados = servicosFilial.filter((servico) => idsServicos.includes(String(servico.idServico)));
  const filial = filiais.find((item) => String(item.idUnidade) === idUnidade);

  useEffect(() => {
    if (etapaAnterior.current !== etapa) tituloEtapa.current?.focus();
    etapaAnterior.current = etapa;
  }, [etapa]);

  function trocarFilial(valor) {
    if (valor === idUnidade) return;
    definirIdUnidade(valor);
    definirIdsServicos([]);
  }

  function alternarServico(idServico) {
    const id = String(idServico);
    definirIdsServicos((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]);
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (salvando) return;
    if (etapa < 3) { definirEtapa(etapa + 1); return; }
    if (!nome.trim() || !filial || !selecionados.length) return;
    definirSalvando(true);
    try {
      await enviarFormulario(evento, editando ? `/funcionarios/${profissional.idFuncionario}` : '/funcionarios', editando ? 'PATCH' : 'POST');
    } finally { definirSalvando(false); }
  }

  const resumos = [nome.trim() || 'Como se chama?', filial?.nome || 'Onde atende?', selecionados.length ? `${selecionados.length} selecionado${selecionados.length === 1 ? '' : 's'}` : 'O que realiza?'];

  return <form aria-label={editando ? 'Editar profissional' : 'Cadastrar profissional'} className="formulario-salao formulario-profissional" onSubmit={enviar}>
    <input name="nome" type="hidden" value={nome.trim()} />
    <input name="idUnidade" type="hidden" value={idUnidade} />
    <ol aria-label="Etapas do profissional" className="profissional-etapas">
      {etapas.map((rotulo, indice) => <li key={rotulo}>
        <button aria-current={etapa === indice + 1 ? 'step' : undefined} disabled={salvando || indice + 1 > etapa} onClick={() => definirEtapa(indice + 1)} type="button">
          <span className="profissional-etapas__numero" aria-hidden="true">{indice + 1}</span>
          <span><strong>{rotulo}</strong><small>{resumos[indice]}</small></span>
        </button>
      </li>)}
    </ol>
    <div className="profissional-etapa">
      <p className="profissional-etapa__indicador">Etapa {etapa} de 3</p>
      <h2 ref={tituloEtapa} tabIndex={-1}>{['Quem é o profissional?', 'Em qual filial vai atender?', 'Quais serviços realiza?'][etapa - 1]}</h2>
      {etapa === 1 && <label className="campo-formulario"><span>Nome do profissional</span><input autoComplete="name" disabled={salvando} maxLength={120} onChange={(evento) => definirNome(evento.target.value)} placeholder="Digite o nome" required value={nome} /></label>}
      {etapa === 2 && <>
        <label className="campo-formulario"><span>Filial</span><select disabled={salvando} onChange={(evento) => trocarFilial(evento.target.value)} required value={idUnidade}><option value="">Selecione uma filial</option>{filiais.map((item) => <option key={item.idUnidade} value={item.idUnidade}>{item.nome}</option>)}</select></label>
        <p className="profissional-ajuda">Na próxima etapa, escolha os serviços disponíveis nesta filial.</p>
      </>}
      {etapa === 3 && <>
        <fieldset className="profissional-servicos" disabled={salvando}>
          <legend>Serviços que realiza</legend>
          <p className="profissional-ajuda" id="profissional-servicos-ajuda">Selecione um ou mais serviços de {filial?.nome}.</p>
          <div aria-describedby="profissional-servicos-ajuda" className="profissional-servicos__lista">
            {servicosFilial.map((servico) => <label className={`profissional-servico${idsServicos.includes(String(servico.idServico)) ? ' profissional-servico--selecionado' : ''}`} key={servico.idServico}>
              <input checked={idsServicos.includes(String(servico.idServico))} name="idsServicos" onChange={() => alternarServico(servico.idServico)} type="checkbox" value={servico.idServico} />
              <span><strong>{servico.nome}</strong><small>{servico.duracaoMinutos} min · {Number(servico.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</small></span>
            </label>)}
          </div>
        </fieldset>
        {!servicosFilial.length && <p className="profissional-ajuda">Esta filial ainda não tem serviços ativos. <Link href="/salao/servicos">Cadastrar serviços</Link></p>}
        <p className="profissional-selecao" role="status">{selecionados.length ? `${selecionados.length} serviço${selecionados.length === 1 ? '' : 's'} selecionado${selecionados.length === 1 ? '' : 's'}` : 'Selecione ao menos um serviço para salvar.'}</p>
      </>}
    </div>
    <div className="profissional-acoes">
      {etapa > 1 && <button className="botao-secundario" disabled={salvando} onClick={() => definirEtapa(etapa - 1)} type="button">Voltar</button>}
      {editando && <button className="botao-secundario" disabled={salvando} onClick={aoCancelar} type="button">Cancelar edição</button>}
      <button className="botao-enviar" disabled={salvando || (etapa === 1 && !nome.trim()) || (etapa === 2 && !filial) || (etapa === 3 && !selecionados.length)} type="submit">
        {salvando ? 'Salvando...' : etapa < 3 ? 'Continuar →' : editando ? 'Salvar profissional' : 'Adicionar profissional'}
      </button>
    </div>
  </form>;
}
