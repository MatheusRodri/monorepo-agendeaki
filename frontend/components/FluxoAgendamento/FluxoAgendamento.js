'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requisitarApi } from '../../utils/api';
import { limparSessao, obterTokenAcesso } from '../../utils/respostaApi';
import { toastErro } from '../../utils/toast';

function dataLocal(data = new Date()) {
  const deslocamento = data.getTimezoneOffset() * 60000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 10);
}

function caminhoAtual(slugSalao, slugFilial, selecao) {
  const parametros = new URLSearchParams();
  if (selecao.idServico) parametros.set('servico', selecao.idServico);
  if (selecao.idFuncionario) parametros.set('profissional', selecao.idFuncionario);
  if (selecao.data) parametros.set('data', selecao.data);
  if (selecao.horario) parametros.set('horario', selecao.horario);
  const consulta = parametros.toString();
  return `/${slugSalao}/${slugFilial}${consulta ? `?${consulta}` : ''}`;
}

export default function FluxoAgendamento({ slugFilial, slugSalao }) {
  const roteador = useRouter();
  const [pagina, definirPagina] = useState(null);
  const [selecao, definirSelecao] = useState({ data: '', horario: '', idFuncionario: '', idServico: '' });
  const [selecaoInicializada, definirSelecaoInicializada] = useState(false);
  const [horarios, definirHorarios] = useState([]);
  const [observacao, definirObservacao] = useState('');
  const [mensagem, definirMensagem] = useState('Carregando página de agendamento...');
  const [enviando, definirEnviando] = useState(false);
  const [modalAberto, definirModalAberto] = useState(false);
  const [profissionalConfirmacao, definirProfissionalConfirmacao] = useState(null);
  const [mensagemModal, definirMensagemModal] = useState('');
  const [horarioConfirmacaoDisponivel, definirHorarioConfirmacaoDisponivel] = useState(true);
  const [atribuicaoMudou, definirAtribuicaoMudou] = useState(false);
  const [confirmacaoFinal, definirConfirmacaoFinal] = useState(null);
  const [avaliacoes, definirAvaliacoes] = useState({ resumo: {}, servicos: [], avaliacoes: [], temMais: false });
  const [paginaAvaliacoes, definirPaginaAvaliacoes] = useState(1);

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    definirSelecao({
      data: parametros.get('data') ?? '',
      horario: parametros.get('horario') ?? '',
      idFuncionario: parametros.get('profissional') ?? '',
      idServico: parametros.get('servico') ?? '',
    });
    definirSelecaoInicializada(true);
    requisitarApi(`/api/publico/agendamento/${slugSalao}/${slugFilial}`)
      .then((dados) => { definirPagina(dados); definirMensagem(dados.disponivel ? '' : 'Esta filial está temporariamente sem serviços ou profissionais disponíveis.'); })
      .catch((erro) => { definirMensagem('Não foi possível abrir a agenda. Atualize a página para tentar novamente.'); toastErro(erro.message); });
  }, [slugFilial, slugSalao]);

  useEffect(() => {
    if (!pagina?.filial?.idUnidade) return;
    let ativo = true;
    requisitarApi(`/api/publico/avaliacoes/${pagina.filial.idUnidade}`, { parametros: { pagina: paginaAvaliacoes } })
      .then((dados) => { if (ativo) definirAvaliacoes((atuais) => ({ ...dados, avaliacoes: paginaAvaliacoes === 1 ? dados.avaliacoes : [...atuais.avaliacoes, ...dados.avaliacoes] })); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [pagina?.filial?.idUnidade, paginaAvaliacoes]);

  useEffect(() => {
    if (!selecaoInicializada) return;
    const novoCaminho = caminhoAtual(slugSalao, slugFilial, selecao);
    const caminhoNavegador = `${window.location.pathname}${window.location.search}`;
    if (novoCaminho !== caminhoNavegador) window.history.replaceState(null, '', novoCaminho);
  }, [selecao, selecaoInicializada, slugFilial, slugSalao]);

  useEffect(() => {
    if (!confirmacaoFinal) return undefined;
    const temporizador = window.setTimeout(() => roteador.push('/cliente/agendamentos'), 10000);
    return () => window.clearTimeout(temporizador);
  }, [confirmacaoFinal, roteador]);

  const servico = useMemo(() => pagina?.servicos.find((item) => String(item.idServico) === String(selecao.idServico)), [pagina, selecao.idServico]);
  const dataMaxima = useMemo(() => { const limite = new Date(); limite.setDate(limite.getDate() + 60); return dataLocal(limite); }, []);
  const horarioSelecionado = horarios.find((item) => item.inicio === selecao.horario);

  useEffect(() => {
    const idFuncionarioValido = selecao.idFuncionario === 'qualquer'
      || servico?.profissionais.some((item) => String(item.idFuncionario) === String(selecao.idFuncionario));
    if (!servico || !selecao.data || !idFuncionarioValido) { definirHorarios([]); return; }
    definirMensagem('Consultando horários disponíveis...');
    requisitarApi(`/api/publico/agendamento/${slugSalao}/${slugFilial}/horarios`, {
      parametros: { data: selecao.data, idFuncionario: selecao.idFuncionario, idServico: selecao.idServico },
    }).then((dados) => {
      definirHorarios(dados.horarios);
      definirMensagem(dados.horarios.length ? '' : 'Não há horários disponíveis nesta data. Escolha outro dia.');
    }).catch((erro) => { definirHorarios([]); definirMensagem(''); toastErro(erro.message); });
  }, [selecao.data, selecao.idFuncionario, selecao.idServico, servico, slugFilial, slugSalao]);

  function atualizarSelecao(alteracoes) {
    definirSelecao((atual) => ({ ...atual, ...alteracoes }));
  }

  function iniciarConfirmacao(evento) {
    evento.preventDefault();
    if (!servico || !selecao.data || !selecao.horario || !selecao.idFuncionario) return;
    const retorno = caminhoAtual(slugSalao, slugFilial, selecao);
    if (!obterTokenAcesso('cliente')) {
      localStorage.setItem('retornoAgendamento', retorno);
      roteador.push(`/cliente?retorno=${encodeURIComponent(retorno)}`);
      return;
    }

    const profissional = horarioSelecionado?.profissionalSugerido;
    if (!profissional) {
      toastErro('Este horário não tem mais um profissional disponível. Escolha outro horário.');
      return;
    }
    definirProfissionalConfirmacao(profissional);
    definirMensagemModal('');
    definirHorarioConfirmacaoDisponivel(true);
    definirAtribuicaoMudou(false);
    definirModalAberto(true);
  }

  async function recarregarHorarioSelecionado() {
    const dados = await requisitarApi(`/api/publico/agendamento/${slugSalao}/${slugFilial}/horarios`, {
      parametros: { data: selecao.data, idFuncionario: selecao.idFuncionario, idServico: selecao.idServico },
    });
    definirHorarios(dados.horarios);
    return dados.horarios.find((item) => item.inicio === selecao.horario) ?? null;
  }

  async function confirmarAgendamento() {
    if (!servico || !selecao.data || !selecao.horario || !profissionalConfirmacao || !horarioConfirmacaoDisponivel) return;
    const retorno = caminhoAtual(slugSalao, slugFilial, selecao);
    definirEnviando(true);
    definirMensagemModal('');
    definirAtribuicaoMudou(false);
    try {
      const resultado = await requisitarApi('/api/clientes/agendamentos', {
        dados: {
          dataHoraInicio: `${selecao.data}T${selecao.horario}:00`,
          idFuncionario: Number(profissionalConfirmacao.idFuncionario),
          idServico: Number(selecao.idServico),
          idUnidade: pagina.filial.idUnidade,
          observacao,
        },
        metodo: 'POST',
      });
      definirModalAberto(false);
      definirConfirmacaoFinal({
        data: selecao.data.split('-').reverse().join('/'),
        filial: pagina.filial.nomeUnidade,
        funcionario: resultado.nomeFuncionario || profissionalConfirmacao.nome,
        horario: selecao.horario,
        observacao: observacao.trim(),
        sala: pagina.filial.nomeSalao,
        servico: servico.nome,
        valor: servico.valor.toFixed(2).replace('.', ','),
      });
      definirMensagem('');
      localStorage.removeItem('retornoAgendamento');
      definirHorarios((atuais) => atuais.filter((item) => item.inicio !== selecao.horario));
      atualizarSelecao({ horario: '' });
      definirObservacao('');
      definirProfissionalConfirmacao(null);
    } catch (erro) {
      if (erro.status === 401) {
        limparSessao('cliente'); localStorage.setItem('retornoAgendamento', retorno);
        roteador.push(`/cliente?retorno=${encodeURIComponent(retorno)}`);
      } else if (erro.status === 409) {
        try {
          const horarioAtualizado = await recarregarHorarioSelecionado();
          if (!horarioAtualizado) {
            definirHorarioConfirmacaoDisponivel(false);
            definirMensagemModal('Este horário acabou de ser reservado ou deixou de estar disponível. Altere a seleção para continuar.');
          } else {
            const novaAtribuicao = horarioAtualizado.profissionalSugerido;
            definirHorarioConfirmacaoDisponivel(Boolean(novaAtribuicao));
            if (novaAtribuicao && Number(novaAtribuicao.idFuncionario) !== Number(profissionalConfirmacao.idFuncionario)) {
              definirProfissionalConfirmacao(novaAtribuicao);
              definirAtribuicaoMudou(true);
              definirMensagemModal(`A disponibilidade mudou. O profissional disponível agora é ${novaAtribuicao.nome}. Revise e confirme novamente.`);
            } else {
              definirMensagemModal(novaAtribuicao
                ? 'A disponibilidade mudou durante a confirmação. Revise os dados e tente novamente.'
                : 'Este horário não tem mais um profissional disponível. Altere a seleção para continuar.');
            }
          }
        } catch (falhaAtualizacao) {
          definirHorarioConfirmacaoDisponivel(true);
          definirMensagemModal(falhaAtualizacao.message || 'Não foi possível atualizar a disponibilidade. Tente novamente.');
        }
      } else toastErro(erro.message);
    } finally { definirEnviando(false); }
  }

  function alterarAgendamento() {
    definirModalAberto(false);
    definirMensagemModal('');
    definirAtribuicaoMudou(false);
  }

  function cancelarAgendamento() {
    definirModalAberto(false);
    definirSelecao({ data: '', horario: '', idFuncionario: '', idServico: '' });
    definirObservacao('');
    definirProfissionalConfirmacao(null);
    definirMensagemModal('');
    definirMensagem('');
  }

  if (!pagina) return <main className="pagina-agendamento-publico"><p className="estado-lista">{mensagem}</p></main>;
  const filial = pagina.filial;
  return <main className="pagina-agendamento-publico">
    <header className="cabecalho-agendamento-publico"><Link className="marca" href="/"><span className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><Link href="/cliente/inicio">Explorar salões</Link></header>
    <section className="apresentacao-filial"><p className="sobretitulo">Agendamento online</p><h1>{filial.nomeSalao}</h1><p><strong>{filial.nomeUnidade}</strong> · {String(filial.categoria).toLowerCase()}</p><address>{filial.rua}, {filial.numero}{filial.complemento ? ` · ${filial.complemento}` : ''}<br />{filial.bairro}, {filial.municipio}/{filial.estado}{filial.telefone ? ` · ${filial.telefone}` : ''}{filial.email && <> · <a href={`mailto:${filial.email}`}>{filial.email}</a></>}</address></section>
    <form className="fluxo-agendamento" onSubmit={iniciarConfirmacao}>
      <Etapa numero="1" titulo="Escolha o serviço">
        <div className="opcoes-agendamento">{pagina.servicos.map((item) => { const resumo = avaliacoes.servicos.find((avaliacao) => Number(avaliacao.idServico) === Number(item.idServico)); return <button className={String(item.idServico) === String(selecao.idServico) ? 'opcao-agendamento opcao-agendamento--ativa' : 'opcao-agendamento'} key={item.idServico} onClick={() => atualizarSelecao({ data: '', horario: '', idFuncionario: '', idServico: String(item.idServico) })} type="button"><strong>{item.nome}</strong><span>{item.duracaoMinutos} min · R$ {item.valor.toFixed(2).replace('.', ',')}</span><small>{item.descricao || 'Um cuidado pensado para você.'}</small>{resumo && <small>★ {Number(resumo.mediaServico).toFixed(1)} · {resumo.quantidade} avaliações</small>}</button>; })}</div>
      </Etapa>
      {servico && <Etapa numero="2" titulo="Escolha o profissional"><div className="opcoes-agendamento opcoes-agendamento--compactas"><button className={selecao.idFuncionario === 'qualquer' ? 'opcao-agendamento opcao-agendamento--ativa' : 'opcao-agendamento'} onClick={() => atualizarSelecao({ data: '', horario: '', idFuncionario: 'qualquer' })} type="button"><strong>Sem preferência</strong><small>Mostraremos quem será atribuído antes de você confirmar.</small></button>{servico.profissionais.map((item) => <button className={String(item.idFuncionario) === String(selecao.idFuncionario) ? 'opcao-agendamento opcao-agendamento--ativa' : 'opcao-agendamento'} key={item.idFuncionario} onClick={() => atualizarSelecao({ data: '', horario: '', idFuncionario: String(item.idFuncionario) })} type="button"><strong>{item.nome}</strong></button>)}</div></Etapa>}
      {selecao.idFuncionario && <Etapa numero="3" titulo="Escolha a data"><label className="campo-formulario campo-data-agendamento"><span>Data do atendimento</span><input max={dataMaxima} min={dataLocal()} onChange={(evento) => atualizarSelecao({ data: evento.target.value, horario: '' })} required type="date" value={selecao.data} /></label></Etapa>}
      {selecao.data && <Etapa numero="4" titulo="Escolha o horário"><div className="grade-horarios">{horarios.map((item) => <button className={item.inicio === selecao.horario ? 'horario-disponivel horario-disponivel--ativo' : 'horario-disponivel'} key={item.inicio} onClick={() => atualizarSelecao({ horario: item.inicio })} type="button">{item.inicio}</button>)}</div>{mensagem && <p className="estado-lista">{mensagem}</p>}</Etapa>}
      {selecao.horario && <Etapa numero="5" titulo="Revise e confirme"><div className="resumo-agendamento"><strong>{servico.nome}</strong><span>{selecao.data.split('-').reverse().join('/')} às {selecao.horario}</span><span>{servico.duracaoMinutos} min · R$ {servico.valor.toFixed(2).replace('.', ',')}</span></div><label className="campo-formulario"><span>Observação <small>Opcional</small></span><textarea maxLength="500" onChange={(evento) => definirObservacao(evento.target.value)} value={observacao} /></label><button className="botao-enviar" disabled={enviando} type="submit">{obterTokenAcesso('cliente') ? 'Finalizar agendamento' : 'Entrar para continuar'} →</button></Etapa>}
    </form>
    {modalAberto && <div className="modal-revisao-agendamento" role="presentation"><section aria-labelledby="titulo-revisao-agendamento" aria-modal="true" className="modal-revisao-agendamento__conteudo" role="dialog"><p className="sobretitulo">Confira antes de confirmar</p><h2 id="titulo-revisao-agendamento">Resumo do agendamento</h2><dl className="modal-revisao-agendamento__detalhes"><div><dt>Salão</dt><dd>{filial.nomeSalao}</dd></div><div><dt>Filial</dt><dd>{filial.nomeUnidade}</dd></div><div><dt>Serviço</dt><dd>{servico?.nome}</dd></div><div><dt>Profissional</dt><dd>{profissionalConfirmacao?.nome || 'Indisponível'}{selecao.idFuncionario === 'qualquer' && <small> atribuído automaticamente</small>}</dd></div><div><dt>Data e horário</dt><dd>{selecao.data.split('-').reverse().join('/')} às {selecao.horario}</dd></div><div><dt>Duração</dt><dd>{servico?.duracaoMinutos} min</dd></div><div><dt>Valor</dt><dd>R$ {servico?.valor.toFixed(2).replace('.', ',')}</dd></div>{observacao.trim() && <div><dt>Observação</dt><dd>{observacao.trim()}</dd></div>}</dl>{mensagemModal && <p className="modal-revisao-agendamento__mensagem" role="status">{mensagemModal}</p>}<div className="modal-revisao-agendamento__acoes"><button className="botao-secundario modal-revisao-agendamento__cancelar" disabled={enviando} onClick={cancelarAgendamento} type="button">Cancelar</button><button className="botao-secundario" disabled={enviando} onClick={alterarAgendamento} type="button">Alterar</button><button className="botao-enviar" disabled={enviando || !horarioConfirmacaoDisponivel || !profissionalConfirmacao} onClick={confirmarAgendamento} type="button">{enviando ? 'Confirmando...' : atribuicaoMudou ? 'Confirmar novo profissional' : 'Confirmar agendamento'}</button></div></section></div>}
    {confirmacaoFinal && <div className="modal-revisao-agendamento" role="presentation"><section aria-labelledby="titulo-agendamento-confirmado" aria-modal="true" className="modal-revisao-agendamento__conteudo modal-revisao-agendamento__sucesso" role="dialog"><span aria-hidden="true" className="modal-revisao-agendamento__icone">✓</span><p className="sobretitulo">Tudo certo</p><h2 id="titulo-agendamento-confirmado">Agendamento confirmado!</h2><p className="modal-revisao-agendamento__texto">Sua reserva foi realizada. Você será levado aos seus agendamentos em alguns segundos.</p><dl className="modal-revisao-agendamento__detalhes"><div><dt>Salão</dt><dd>{confirmacaoFinal.sala}</dd></div><div><dt>Filial</dt><dd>{confirmacaoFinal.filial}</dd></div><div><dt>Serviço</dt><dd>{confirmacaoFinal.servico}</dd></div><div><dt>Profissional</dt><dd>{confirmacaoFinal.funcionario}</dd></div><div><dt>Data e horário</dt><dd>{confirmacaoFinal.data} às {confirmacaoFinal.horario}</dd></div><div><dt>Valor</dt><dd>R$ {confirmacaoFinal.valor}</dd></div>{confirmacaoFinal.observacao && <div><dt>Observação</dt><dd>{confirmacaoFinal.observacao}</dd></div>}</dl><button className="botao-enviar modal-revisao-agendamento__ir-agendamentos" onClick={() => roteador.push('/cliente/agendamentos')} type="button">Ir para meus agendamentos →</button></section></div>}
    <section className="avaliacoes-publicas"><h2>Avaliações desta filial</h2><p>{avaliacoes.resumo.quantidade ? `★ ${Number(avaliacoes.resumo.mediaSalao).toFixed(1)} · ${avaliacoes.resumo.quantidade} avaliações` : 'Esta filial ainda não recebeu avaliações.'}</p><div className="lista-avaliacoes">{avaliacoes.avaliacoes.map((avaliacao) => <article className="cartao-avaliacao" key={avaliacao.idAvaliacao}><strong>{avaliacao.primeiroNome}</strong><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(avaliacao.dataAvaliacao))} · {avaliacao.servico}</small><span>Filial {avaliacao.notaSalao} ★ · Serviço {avaliacao.notaServico} ★</span>{avaliacao.comentario && <p>{avaliacao.comentario}</p>}</article>)}</div>{avaliacoes.temMais && <button className="botao-secundario" onClick={() => definirPaginaAvaliacoes((atual) => atual + 1)} type="button">Ver mais avaliações</button>}</section>
  </main>;
}

function Etapa({ children, numero, titulo }) {
  return <section className="etapa-agendamento"><div className="etapa-agendamento__titulo"><span>{numero}</span><h2>{titulo}</h2></div>{children}</section>;
}
