'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DialogoAgendamento from '../DialogoAgendamento/DialogoAgendamento';
import HorarioServico, { horarioDefinido, servicoRepetidoNaData } from './HorarioServico';
import { requisitarApi } from '../../utils/api';
import { limparSessao, obterTokenAcesso } from '../../utils/respostaApi';
import { toastErro } from '../../utils/toast';
import PrecoServico from '../PrecoServico/PrecoServico';

const dinheiro = (valor) => `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;
const dataFormatada = (valor) => valor.split('-').reverse().join('/');
function dataLocal(dias = 0) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const data = new Date(`${partes.year}-${partes.month}-${partes.day}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
function normalizarRetorno(valor) {
  try {
    const destino = new URL(valor || '/cliente/inicio', window.location.origin);
    if (destino.origin === window.location.origin && destino.pathname === '/cliente/inicio') return `${destino.pathname}${destino.search}`;
  } catch {}
  return '/cliente/inicio';
}
function novoItem(servico, salvo = {}) {
  return {
    chave: crypto.randomUUID(), idServico: String(servico.idServico), nome: servico.nome,
    valor: Number(servico.valor), duracaoMinutos: servico.duracaoMinutos,
    valorOriginal: servico.valorOriginal, promocaoAtiva: servico.promocaoAtiva,
    idFuncionario: 'qualquer', data: '', horario: '', fim: '', profissional: null, observacao: '',
    ...salvo,
  };
}

export default function FluxoAgendamento({ slugFilial, slugSalao }) {
  const roteador = useRouter();
  const [pagina, definirPagina] = useState(null);
  const [retornoMapa, definirRetornoMapa] = useState('/cliente/inicio');
  const [lista, definirLista] = useState([]);
  const [etapa, definirEtapa] = useState('servicos');
  const [itemAtivo, definirItemAtivo] = useState(null);
  const [inicializada, definirInicializada] = useState('');
  const [mensagem, definirMensagem] = useState('Carregando página de agendamento...');
  const [enviando, definirEnviando] = useState(false);
  const [revisao, definirRevisao] = useState(null);
  const [mensagemModal, definirMensagemModal] = useState('');
  const [indiceConflito, definirIndiceConflito] = useState(null);
  const [confirmacaoFinal, definirConfirmacaoFinal] = useState(null);
  const [avaliacoes, definirAvaliacoes] = useState({ resumo: {}, servicos: [], avaliacoes: [], temMais: false });
  const [paginaAvaliacoes, definirPaginaAvaliacoes] = useState(1);
  const focoPendente = useRef(null);
  const chaveRascunho = `agendamentos:${slugSalao}:${slugFilial}`;
  const dataMaxima = useMemo(() => dataLocal(60), []);
  const total = lista.reduce((soma, item) => soma + Math.round(Number(item.valor) * 100), 0) / 100;
  const definidos = lista.filter((item) => horarioDefinido(item) && !servicoRepetidoNaData(lista, item)).length;
  const listaCompleta = lista.length > 0 && definidos === lista.length;
  const idsSelecionados = new Set(lista.map((item) => String(item.idServico)));

  useEffect(() => {
    let ativo = true;
    definirPagina(null); definirRevisao(null); definirConfirmacaoFinal(null);
    const parametros = new URLSearchParams(window.location.search);
    definirRetornoMapa(normalizarRetorno(parametros.get('retornoMapa')));
    let salvo;
    try { salvo = JSON.parse(sessionStorage.getItem(chaveRascunho) || 'null'); } catch {}
    requisitarApi(`/api/publico/agendamento/${slugSalao}/${slugFilial}`).then((dados) => {
      if (!ativo) return;
      const itens = (Array.isArray(salvo?.itens) ? salvo.itens : []).filter((item) => item && Number(item.idServico) > 0)
        .map((item) => {
          const servico = dados.servicos.find((opcao) => String(opcao.idServico) === String(item.idServico));
          return novoItem(servico ?? item, { ...item, chave: item.chave || crypto.randomUUID(), idFuncionario: String(item.idFuncionario || 'qualquer'),
            data: item.data || '', horario: item.horario || '', fim: item.fim || '', observacao: item.observacao || '',
            ...(servico ? { nome: servico.nome, valor: Number(servico.valor), valorOriginal: servico.valorOriginal,
              promocaoAtiva: servico.promocaoAtiva, duracaoMinutos: servico.duracaoMinutos } : {}) });
        });
      // Restaura também um serviço em edição salvo pela versão anterior da tela.
      const selecaoAnterior = salvo?.selecao;
      const idInicial = selecaoAnterior?.idServico || parametros.get('servico');
      const servicoInicial = dados.servicos.find((opcao) => String(opcao.idServico) === String(idInicial));
      if (servicoInicial && !itens.some((item) => String(item.idServico) === String(idInicial))) {
        itens.push(novoItem(servicoInicial, { data: selecaoAnterior?.data || parametros.get('data') || '',
          idFuncionario: selecaoAnterior?.idFuncionario || parametros.get('profissional') || 'qualquer', observacao: salvo?.observacao || '' }));
      }
      const fase = salvo?.etapa === 'horarios' || (salvo?.etapa == null && itens.some(horarioDefinido)) ? 'horarios' : 'servicos';
      const chaveAtiva = itens.some((item) => item.chave === salvo?.itemAtivo) ? salvo.itemAtivo
        : itens[Number.isInteger(salvo?.indiceEdicao) ? salvo.indiceEdicao : -1]?.chave || itens.find((item) => !horarioDefinido(item) || servicoRepetidoNaData(itens, item))?.chave || null;
      definirPagina(dados); definirLista(itens); definirEtapa(fase); definirItemAtivo(chaveAtiva);
      definirMensagem(dados.disponivel ? '' : 'Esta unidade está temporariamente sem serviços ou profissionais disponíveis.');
      definirInicializada(chaveRascunho);
    }).catch((erro) => { if (ativo) { definirMensagem('Não foi possível abrir a agenda. Atualize a página para tentar novamente.'); toastErro(erro.message); } });
    return () => { ativo = false; };
  }, [chaveRascunho, slugFilial, slugSalao]);

  useEffect(() => {
    if (inicializada !== chaveRascunho || confirmacaoFinal) return;
    try { sessionStorage.setItem(chaveRascunho, JSON.stringify({ itens: lista, etapa, itemAtivo })); } catch {}
  }, [chaveRascunho, confirmacaoFinal, etapa, inicializada, itemAtivo, lista]);

  useEffect(() => {
    if (!pagina?.filial?.idUnidade) return;
    let ativo = true;
    requisitarApi(`/api/publico/avaliacoes/${pagina.filial.idUnidade}`, { parametros: { pagina: paginaAvaliacoes } })
      .then((dados) => { if (ativo) definirAvaliacoes((atuais) => ({ ...dados, avaliacoes: paginaAvaliacoes === 1 ? dados.avaliacoes : [...atuais.avaliacoes, ...dados.avaliacoes] })); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [pagina?.filial?.idUnidade, paginaAvaliacoes]);

  useEffect(() => {
    if (!confirmacaoFinal) return;
    const temporizador = window.setTimeout(() => roteador.push('/cliente/agendamentos'), 10000);
    return () => window.clearTimeout(temporizador);
  }, [confirmacaoFinal, roteador]);

  useEffect(() => {
    if (!focoPendente.current) return;
    const destino = document.getElementById(focoPendente.current);
    const controle = destino?.querySelector('select, input') ?? destino;
    controle?.focus();
    focoPendente.current = null;
  }, [etapa, itemAtivo]);

  function alternarServico(servico) {
    definirIndiceConflito(null);
    if (idsSelecionados.has(String(servico.idServico))) {
      definirLista((atuais) => atuais.filter((item) => String(item.idServico) !== String(servico.idServico)));
    } else if (lista.length < 50) definirLista((atuais) => [...atuais, novoItem(servico)]);
  }
  function escolherHorarios() {
    const primeiro = lista.find((item) => !horarioDefinido(item) || servicoRepetidoNaData(lista, item)) ?? lista[0];
    focoPendente.current = `horario-${primeiro.chave}`;
    definirEtapa('horarios');
    definirItemAtivo(primeiro.chave);
  }
  function alterarItem(chave, alteracoes) {
    definirLista((atuais) => atuais.map((item) => item.chave === chave ? { ...item, ...alteracoes } : item));
    definirIndiceConflito(null);
  }
  function removerItem(chave) {
    const restantes = lista.filter((item) => item.chave !== chave);
    definirLista(restantes); definirIndiceConflito(null);
    if (!restantes.length) definirEtapa('servicos');
    if (itemAtivo === chave) definirItemAtivo(restantes.find((item) => !horarioDefinido(item))?.chave ?? null);
  }
  function adicionarOutraData(item) {
    if (lista.length >= 50) return;
    const novo = novoItem(item, { idFuncionario: item.idFuncionario });
    focoPendente.current = `horario-${novo.chave}`;
    definirLista((atuais) => [...atuais, novo]); definirItemAtivo(novo.chave); definirIndiceConflito(null);
  }
  function concluirHorario(chave) {
    const proximo = lista.find((item) => item.chave !== chave && (!horarioDefinido(item) || servicoRepetidoNaData(lista, item)));
    focoPendente.current = proximo ? `horario-${proximo.chave}` : 'revisar-agendamentos';
    definirItemAtivo(proximo?.chave ?? null);
  }
  function irParaLogin() {
    const parametros = new URLSearchParams();
    if (retornoMapa !== '/cliente/inicio') parametros.set('retornoMapa', retornoMapa);
    const retorno = `/${slugSalao}/${slugFilial}${parametros.size ? `?${parametros}` : ''}`;
    localStorage.setItem('retornoAgendamento', retorno);
    roteador.push(`/cliente?retorno=${encodeURIComponent(retorno)}`);
  }
  async function consultarHorarios(item) {
    const caminho = obterTokenAcesso('cliente') ? '/api/clientes/agendamentos/horarios' : `/api/publico/agendamento/${slugSalao}/${slugFilial}/horarios`;
    return requisitarApi(caminho, { parametros: { data: item.data, idFuncionario: item.idFuncionario, idServico: item.idServico, idUnidade: pagina.filial.idUnidade } });
  }
  async function revisarLista() {
    if (!listaCompleta || enviando) return;
    if (!obterTokenAcesso('cliente')) { irParaLogin(); return; }
    definirEnviando(true); definirMensagemModal(''); definirIndiceConflito(null);
    let indiceVerificando = 0;
    try {
      const atualizada = [];
      let atribuicaoMudou = false;
      let precoMudou = false;
      for (let indice = 0; indice < lista.length; indice += 1) {
        indiceVerificando = indice;
        const item = lista[indice];
        const dados = await consultarHorarios(item);
        const horario = dados.horarios.find((opcao) => opcao.inicio === item.horario);
        if (!horario || lista.some((outro, j) => indice !== j && outro.data === item.data && item.horario < outro.fim && horario.fim > outro.horario)) {
          throw new Error(`O horário de ${item.nome} não está mais disponível. Escolha outro horário.`);
        }
        const profissional = horario.profissionais.find((p) => Number(p.idFuncionario) === Number(item.profissional.idFuncionario)) ?? horario.profissionalSugerido;
        atribuicaoMudou ||= Number(profissional.idFuncionario) !== Number(item.profissional.idFuncionario);
        precoMudou ||= Math.round(Number(item.valor) * 100) !== Math.round(Number(dados.servico.valor) * 100);
        atualizada.push({ ...item, fim: horario.fim, profissional, nome: dados.servico.nome, valor: dados.servico.valor,
          valorOriginal: dados.servico.valorOriginal, promocaoAtiva: dados.servico.promocaoAtiva, duracaoMinutos: dados.duracaoMinutos });
      }
      definirLista(atualizada); definirRevisao(atualizada);
      definirMensagemModal([precoMudou ? 'Os preços foram atualizados. Confira os valores antes de confirmar.' : '',
        atribuicaoMudou ? 'A disponibilidade mudou e houve nova atribuição de profissional. Revise a lista antes de confirmar.' : ''].filter(Boolean).join(' '));
    } catch (erro) {
      definirRevisao(null); definirIndiceConflito(indiceVerificando); definirItemAtivo(lista[indiceVerificando]?.chave ?? null);
      if (erro.status === 401) { limparSessao('cliente'); irParaLogin(); } else toastErro(erro.message);
    } finally { definirEnviando(false); }
  }
  async function confirmarAgendamentos() {
    if (!revisao || enviando) return;
    definirEnviando(true);
    try {
      const resultado = await requisitarApi('/api/clientes/agendamentos/lote', { metodo: 'POST', dados: {
        idUnidade: pagina.filial.idUnidade,
        itens: revisao.map((item) => ({ idServico: Number(item.idServico), idFuncionario: item.profissional.idFuncionario, dataHoraInicio: `${item.data}T${item.horario}:00`, observacao: item.observacao, valorEsperado: Number(item.valor).toFixed(2) })),
      } });
      definirConfirmacaoFinal(resultado.agendamentos); definirRevisao(null); definirLista([]);
      sessionStorage.removeItem(chaveRascunho); localStorage.removeItem('retornoAgendamento');
    } catch (erro) {
      if (erro.status === 401) { limparSessao('cliente'); irParaLogin(); }
      else if (erro.status === 409) {
        definirRevisao(null); definirIndiceConflito(erro.indiceItem ?? null); definirItemAtivo(lista[erro.indiceItem]?.chave ?? null);
        toastErro(`${erro.message} Nenhum serviço foi reservado. ${erro.codigo === 'PRECO_ALTERADO' ? 'Revise os valores para confirmar novamente.' : 'Revise os horários para confirmar novamente.'}`);
      } else definirMensagemModal(erro.message);
    } finally { definirEnviando(false); }
  }

  if (!pagina) return <main className="pagina-agendamento-publico"><p className="estado-lista">{mensagem}</p></main>;
  const filial = pagina.filial;
  return <main className="pagina-agendamento-publico">
    <header className="cabecalho-agendamento-publico"><Link className="marca" href="/"><span className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><Link className="botao-voltar-mapa" href={retornoMapa}>← Voltar ao mapa</Link></header>
    <section className="apresentacao-filial"><p className="sobretitulo">Agendamento online</p><h1>{filial.nomeSalao}</h1><p><strong>{filial.nomeUnidade}</strong> · {String(filial.categoria).toLowerCase()}</p><address>{filial.rua}, {filial.numero}{filial.complemento ? ` · ${filial.complemento}` : ''}<br />{filial.bairro}, {filial.municipio}/{filial.estado}{filial.telefone ? ` · ${filial.telefone}` : ''}{filial.email && <> · <a href={`mailto:${filial.email}`}>{filial.email}</a></>}</address></section>
    <div className="fluxo-agendamento">
      <Etapa numero="1" titulo="Escolha seus serviços" acao={etapa === 'horarios' && <button className="link-etapa-agendamento" disabled={enviando} onClick={() => definirEtapa('servicos')} type="button">Alterar serviços</button>}>
        {etapa === 'servicos' ? <>
          <p className="etapa-agendamento__ajuda">Selecione um ou mais serviços para agendar.</p>
          <div className="opcoes-agendamento">{pagina.servicos.map((item) => {
            const selecionado = idsSelecionados.has(String(item.idServico));
            const resumo = avaliacoes.servicos.find((avaliacao) => Number(avaliacao.idServico) === Number(item.idServico));
            return <button aria-pressed={selecionado} className={`opcao-agendamento opcao-agendamento--servico${selecionado ? ' opcao-agendamento--ativa' : ''}`} disabled={!selecionado && lista.length >= 50} key={item.idServico} onClick={() => alternarServico(item)} type="button">
              <span aria-hidden="true" className="opcao-agendamento__check">{selecionado ? '✓' : ''}</span>
              <strong>{item.nome}</strong><span>{item.duracaoMinutos} min</span><PrecoServico {...item} />
              {item.descricao && <small>{item.descricao}</small>}
              {resumo && <small>★ {Number(resumo.mediaServico).toFixed(1)} · {resumo.quantidade} avaliações</small>}
            </button>;
          })}</div>
          <div className="rodape-selecao-servicos"><p aria-live="polite">{idsSelecionados.size ? `${idsSelecionados.size} serviço${idsSelecionados.size > 1 ? 's' : ''} selecionado${idsSelecionados.size > 1 ? 's' : ''}` : 'Escolha os serviços acima'}{lista.length > 0 && <strong>{dinheiro(total)}</strong>}</p><button className="botao-enviar" disabled={!lista.length} onClick={escolherHorarios} type="button">Escolher horários →</button></div>
        </> : <p className="etapa-agendamento__ajuda">{pagina.servicos.filter((item) => idsSelecionados.has(String(item.idServico))).map((item) => item.nome).join(' · ')}</p>}
      </Etapa>
      {etapa === 'horarios' && <>
        <Etapa numero="2" titulo="Escolha os horários">
          <p className="etapa-agendamento__ajuda">Defina a data e o profissional de cada serviço. Pode ser no mesmo dia ou em dias diferentes.</p>
          <p className="progresso-horarios" aria-live="polite">{definidos} de {lista.length} serviço{lista.length > 1 ? 's' : ''} com horário definido</p>
          <div className="servicos-selecionados">{lista.map((item, indice) => {
            const aberto = itemAtivo === item.chave;
            const repetido = servicoRepetidoNaData(lista, item);
            const completo = horarioDefinido(item) && !repetido;
            const servico = pagina.servicos.find((opcao) => String(opcao.idServico) === String(item.idServico));
            return <article className={`servico-selecionado${aberto ? ' servico-selecionado--aberto' : ''}`} key={item.chave}>
              <h3 className="servico-selecionado__titulo"><button aria-expanded={aberto} aria-controls={`horario-${item.chave}`} className="servico-selecionado__abrir" disabled={enviando} onClick={() => definirItemAtivo(aberto ? null : item.chave)} type="button">
                <span aria-hidden="true" className={`servico-selecionado__numero${completo ? ' servico-selecionado__numero--pronto' : ''}`}>{completo ? '✓' : indice + 1}</span>
                <span className="servico-selecionado__descricao"><strong>{item.nome}</strong><span>{completo ? `${dataFormatada(item.data)} · ${item.horario}–${item.fim} · ${item.profissional.nome}` : 'Escolha a data e o horário'}</span></span>
                <span className="servico-selecionado__valor"><PrecoServico {...item} /></span><span aria-hidden="true" className="servico-selecionado__seta">{aberto ? '−' : '+'}</span>
              </button></h3>
              <div className="servico-selecionado__conteudo" hidden={!aberto} id={`horario-${item.chave}`}>
                {aberto && <HorarioServico item={item} itens={lista} servico={servico} idUnidade={filial.idUnidade} slugSalao={slugSalao} slugFilial={slugFilial} dataMinima={dataLocal()} dataMaxima={dataMaxima} aoAlterar={(alteracoes) => alterarItem(item.chave, alteracoes)} aoConcluir={() => concluirHorario(item.chave)} temProximo={lista.some((outro) => outro.chave !== item.chave && (!horarioDefinido(outro) || servicoRepetidoNaData(lista, outro)))} />}
              </div>
              {indiceConflito === indice && <p className="aviso-horario-servico servico-selecionado__aviso" role="alert">Revise este serviço antes de confirmar: a disponibilidade mudou.</p>}
              <div className="servico-selecionado__acoes">{completo && <button className="link-etapa-agendamento" disabled={enviando || lista.length >= 50} onClick={() => adicionarOutraData(item)} type="button">+ Agendar em outro dia</button>}<button aria-label={`Remover serviço ${indice + 1}: ${item.nome}`} className="link-etapa-agendamento link-etapa-agendamento--remover" disabled={enviando} onClick={() => removerItem(item.chave)} type="button">Remover</button></div>
            </article>;
          })}</div>
        </Etapa>
        <section aria-labelledby="titulo-resumo-servicos" className="etapa-agendamento resumo-servicos-agendamento">
          <div><h2 id="titulo-resumo-servicos">Resumo do agendamento</h2><p className="etapa-agendamento__ajuda">{lista.length} serviço{lista.length > 1 ? 's' : ''}{listaCompleta ? ' · Tudo pronto para revisar' : ' · Falta definir os horários'}</p></div>
          <div className="resumo-servicos-agendamento__total"><span>Total</span><strong>{dinheiro(total)}</strong></div>
          <button className="botao-enviar" disabled={enviando || !listaCompleta} id="revisar-agendamentos" onClick={revisarLista} type="button">{enviando ? 'Verificando horários...' : obterTokenAcesso('cliente') ? 'Revisar agendamentos' : 'Entrar para continuar'} →</button>
        </section>
      </>}
    </div>
    {revisao && <DialogoAgendamento tituloId="titulo-revisao-agendamento" retornoFocoId="revisar-agendamentos" aoFechar={() => definirRevisao(null)} ocupado={enviando} classe="modal-revisao-agendamento" classeConteudo="modal-revisao-agendamento__conteudo"><p className="sobretitulo">Confira antes de confirmar</p><h2 id="titulo-revisao-agendamento">Resumo dos agendamentos</h2><p>{filial.nomeSalao} · {filial.nomeUnidade}</p><ol>{revisao.map((item, indice) => <li className="resumo-agendamento" key={indice}><strong>{item.nome}</strong><span>{dataFormatada(item.data)} · {item.horario}–{item.fim}</span><span>{item.profissional.nome}{item.idFuncionario === 'qualquer' ? ' · atribuído automaticamente' : ''}</span><PrecoServico {...item} />{item.observacao && <small>{item.observacao}</small>}</li>)}</ol><p><strong>Total: {dinheiro(total)}</strong></p>{mensagemModal && <p role="status">{mensagemModal}</p>}<div className="modal-revisao-agendamento__acoes"><button className="botao-secundario" disabled={enviando} onClick={() => definirRevisao(null)} type="button">Alterar lista</button><button className="botao-enviar" disabled={enviando} onClick={confirmarAgendamentos} type="button">{enviando ? 'Confirmando...' : 'Confirmar agendamentos'}</button></div></DialogoAgendamento>}
    {confirmacaoFinal && <DialogoAgendamento tituloId="titulo-agendamento-confirmado" aoFechar={() => roteador.push('/cliente/agendamentos')} classe="modal-revisao-agendamento" classeConteudo="modal-revisao-agendamento__conteudo modal-revisao-agendamento__sucesso"><span aria-hidden="true" className="modal-revisao-agendamento__icone">✓</span><h2 id="titulo-agendamento-confirmado">Agendamentos confirmados!</h2><p>{confirmacaoFinal.length} serviço(s) reservado(s) em {filial.nomeUnidade}. Você será levado aos seus agendamentos em alguns segundos.</p><ul>{confirmacaoFinal.map((item) => <li key={item.idAgendamento}>{item.nomeServico} · {dataFormatada(item.dataInicioBanco.slice(0, 10))} às {item.dataInicioBanco.slice(11, 16)} · {item.nomeFuncionario} · {dinheiro(item.valorServico)}</li>)}</ul><button className="botao-enviar" onClick={() => roteador.push('/cliente/agendamentos')} type="button">Ir para meus agendamentos →</button></DialogoAgendamento>}
    <section className="avaliacoes-publicas"><h2>Avaliações desta unidade</h2><p>{avaliacoes.resumo.quantidade ? `★ ${Number(avaliacoes.resumo.mediaSalao).toFixed(1)} · ${avaliacoes.resumo.quantidade} avaliações` : 'Esta unidade ainda não recebeu avaliações.'}</p><div className="lista-avaliacoes">{avaliacoes.avaliacoes.map((avaliacao) => <article className="cartao-avaliacao" key={avaliacao.idAvaliacao}><strong>{avaliacao.primeiroNome}</strong><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(avaliacao.dataAvaliacao))} · {avaliacao.servico}</small><span>Unidade {avaliacao.notaSalao} ★ · Serviço {avaliacao.notaServico} ★</span>{avaliacao.comentario && <p>{avaliacao.comentario}</p>}</article>)}</div>{avaliacoes.temMais && <button className="botao-secundario" onClick={() => definirPaginaAvaliacoes((atual) => atual + 1)} type="button">Ver mais avaliações</button>}</section>  </main>;
}

function Etapa({ children, numero, titulo, acao }) {
  return <section className="etapa-agendamento"><div className="etapa-agendamento__cabecalho"><div className="etapa-agendamento__titulo"><span>{numero}</span><h2>{titulo}</h2></div>{acao}</div>{children}</section>;
}
