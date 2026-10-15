'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import CampoSenha from '../CampoSenha/CampoSenha';
import FormularioFilial from '../FormularioFilial/FormularioFilial';
import DisponibilidadeSalao from '../DisponibilidadeSalao/DisponibilidadeSalao';
import AgendaSalao from '../AgendaSalao/AgendaSalao';
import { dataParaExibicao, dataParaIso, formatarCnpj, formatarData, formatarTelefone } from '../../utils/formatadores';
import { requisitarApi } from '../../utils/api';
import { limparSessao, obterTokenAcesso } from '../../utils/respostaApi';
import { toastAviso, toastErro, toastInfo, toastSucesso } from '../../utils/toast';

const navegacao = [['dashboard', 'Visão geral', '/salao/dashboard'], ['filiais', 'Filiais', '/salao/filiais'], ['servicos', 'Serviços', '/salao/servicos'], ['funcionarios', 'Profissionais', '/salao/funcionarios'], ['disponibilidade', 'Disponibilidade', '/salao/disponibilidade'], ['clientes', 'Clientes', '/salao/clientes'], ['agendamentos', 'Agenda', '/salao/agendamentos'], ['avaliacoes', 'Avaliações', '/salao/avaliacoes'], ['configuracoes', 'Configurações', '/salao/configuracoes']];
const filtrosIniciais = { dataInicio: '', dataFim: '', idUnidade: '', idServico: '', idFuncionario: '' };

export default function AreaSalao({ secao }) {
  const roteador = useRouter();
  const [dados, definirDados] = useState({});
  const [mensagem, definirMensagem] = useState('');
  const [tipoMensagem, definirTipoMensagem] = useState('sucesso');
  const [carregando, definirCarregando] = useState(true);
  const [saindo, definirSaindo] = useState(false);
  const [filialEdicao, definirFilialEdicao] = useState(null);
  const [servicoEdicao, definirServicoEdicao] = useState(null);
  const [funcionarioEdicao, definirFuncionarioEdicao] = useState(null);
  const [idFilialProfissional, definirIdFilialProfissional] = useState('');
  const [tipoAgenda, definirTipoAgenda] = useState('futuros');
  const [filtrosDashboard, definirFiltrosDashboard] = useState(filtrosIniciais);
  const [assinante, definirAssinante] = useState(false);
  const [notificacoes, definirNotificacoes] = useState([]);
  const [notificacoesNaoLidas, definirNotificacoesNaoLidas] = useState(0);
  const carregouNotificacoes = useRef(false);
  const idsNotificacoesConhecidos = useRef(new Set());
  const marcarNotificacaoLidaRef = useRef(null);

  const mostrarToastErro = useCallback((texto) => toastErro(texto), []);

  const mostrarAvisoPremium = useCallback(() => toastAviso('Recurso disponível apenas para usuários Premium.'), []);

  const requisitar = useCallback(async (caminho, opcoes = {}) => {
    const { silenciosa = false } = opcoes;
    const tokenAcesso = obterTokenAcesso('salao');
    if (!tokenAcesso) {
      if (!silenciosa) { limparSessao('salao'); roteador.push('/salao'); }
      throw new Error('Sua sessão não foi encontrada. Faça login novamente.');
    }
    try {
      return await requisitarApi(`/api/salao${caminho}`, {
        dados: opcoes.body ? JSON.parse(opcoes.body) : undefined,
        metodo: opcoes.method,
      });
    } catch (erro) {
      if (erro.status === 401 && !silenciosa) { limparSessao('salao'); roteador.push('/salao'); throw new Error('Sua sessão expirou. Faça login novamente.'); }
      throw erro;
    }
  }, [roteador]);

  const carregarNotificacoes = useCallback(async () => {
    try {
      const resultado = await requisitar('/notificacoes', { silenciosa: true });
      const novasNotificacoes = (resultado.notificacoes ?? []).filter((notificacao) => !idsNotificacoesConhecidos.current.has(Number(notificacao.id)));
      if (carregouNotificacoes.current && novasNotificacoes.length) {
        novasNotificacoes.slice().reverse().forEach((notificacao) => toastInfo(<LinkToastNotificacao aoAbrir={() => marcarNotificacaoLidaRef.current?.(notificacao.id).catch((erro) => toastErro(erro.message))} notificacao={notificacao} />));
      }
      novasNotificacoes.forEach((notificacao) => idsNotificacoesConhecidos.current.add(Number(notificacao.id)));
      try {
        const idsConhecidos = [...idsNotificacoesConhecidos.current].slice(-1000);
        sessionStorage.setItem('notificacoesSalaoConhecidas', JSON.stringify(idsConhecidos));
      } catch {}
      carregouNotificacoes.current = true;
      definirNotificacoes(resultado.notificacoes ?? []);
      definirNotificacoesNaoLidas(Number(resultado.naoLidas ?? 0));
    } catch {}
  }, [requisitar]);

  useEffect(() => {
    try {
      const snapshotPersistido = sessionStorage.getItem('notificacoesSalaoConhecidas');
      const idsPersistidos = JSON.parse(snapshotPersistido || '[]');
      if (snapshotPersistido !== null && Array.isArray(idsPersistidos)) {
        idsPersistidos.forEach((id) => idsNotificacoesConhecidos.current.add(Number(id)));
        carregouNotificacoes.current = true;
      }
    } catch {}
    carregarNotificacoes();
    const temporizador = window.setInterval(carregarNotificacoes, 20000);
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregarNotificacoes(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.clearInterval(temporizador);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [carregarNotificacoes]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const aoReceberPush = (evento) => {
      if (evento.data?.type !== 'AGENDEAKI_PUSH_NOTIFICATION' || !evento.data.notificacao) return;
      const notificacaoRecebida = evento.data.notificacao;
      if (notificacaoRecebida.audience !== 'salao') return;
      const idNotificacao = Number(notificacaoRecebida.id);
      if (Number.isSafeInteger(idNotificacao) && idNotificacao > 0) {
        if (idsNotificacoesConhecidos.current.has(idNotificacao)) return;
        idsNotificacoesConhecidos.current.add(idNotificacao);
        try {
          sessionStorage.setItem('notificacoesSalaoConhecidas', JSON.stringify([...idsNotificacoesConhecidos.current].slice(-1000)));
        } catch {}
      }
      carregouNotificacoes.current = true;
      toastInfo(<LinkToastNotificacao aoAbrir={() => marcarNotificacaoLidaRef.current?.(notificacaoRecebida.id).catch((erro) => toastErro(erro.message))} notificacao={notificacaoRecebida} />);
    };
    navigator.serviceWorker.addEventListener('message', aoReceberPush);
    return () => navigator.serviceWorker.removeEventListener('message', aoReceberPush);
  }, []);



  useEffect(() => {
    if (!mensagem || tipoMensagem !== 'erro') return;
    mostrarToastErro(mensagem);
    definirMensagem('');
  }, [mensagem, mostrarToastErro, tipoMensagem]);

  async function marcarNotificacaoLida(id) {
    const notificacao = notificacoes.find((item) => Number(item.id) === Number(id));
    if (!notificacao || notificacao.lida) return;
    await requisitar(`/notificacoes/${id}/lida`, { method: 'PATCH' });
    definirNotificacoes((atuais) => atuais.map((item) => Number(item.id) === Number(id) ? { ...item, lida: true } : item));
    definirNotificacoesNaoLidas((quantidade) => Math.max(0, quantidade - 1));
  }
  marcarNotificacaoLidaRef.current = marcarNotificacaoLida;

  async function marcarTodasNotificacoesLidas() {
    await requisitar('/notificacoes/lidas', { method: 'POST' });
    definirNotificacoes((atuais) => atuais.map((item) => ({ ...item, lida: true })));
    definirNotificacoesNaoLidas(0);
  }

  const carregarDados = useCallback(async () => {
    definirCarregando(true); definirMensagem('');
    try {
      if (secao === 'dashboard') {
        const parametros = new URLSearchParams(Object.entries(filtrosDashboard).filter(([, valor]) => valor));
        const resultadoAssinatura = await requisitar('/assinatura');
        const premiumAtivo = Boolean(resultadoAssinatura.assinatura?.temAcessoPremium);
        definirAssinante(premiumAtivo);
        const indicadores = await requisitar(`/indicadores${premiumAtivo ? '/premium' : ''}?${parametros}`);
        if (premiumAtivo && (filtrosDashboard.dataInicio !== indicadores.filtros?.dataInicio || filtrosDashboard.dataFim !== indicadores.filtros?.dataFim)) {
          definirFiltrosDashboard((atuais) => ({ ...atuais, dataInicio: indicadores.filtros.dataInicio, dataFim: indicadores.filtros.dataFim }));
        }
        definirDados({ ...indicadores, premiumAtivo });
      }
      if (secao === 'assinatura') definirDados(await requisitar('/assinatura'));
      if (secao === 'configuracoes') {
        const [dadosSalao, dadosPerfil, resultadoAssinatura] = await Promise.all([requisitar('/saloes/atual'), requisitar('/perfil'), requisitar('/assinatura')]);
        const premiumAtivo = Boolean(resultadoAssinatura.assinatura?.temAcessoPremium);
        definirAssinante(premiumAtivo);
        definirDados({ ...dadosSalao, perfil: dadosPerfil.perfil, premiumAtivo });
      }
      if (secao === 'notificacoes') {
        const resultadoAssinatura = await requisitar('/assinatura');
        const premiumAtivo = Boolean(resultadoAssinatura.assinatura?.temAcessoPremium);
        definirAssinante(premiumAtivo);
        definirDados({ premiumAtivo });
      }
      if (secao === 'filiais') {
        const [filiais, perfil] = await Promise.all([requisitar('/filiais'), requisitar('/perfil')]);
        let premiumAtivo = false;
        try { premiumAtivo = Boolean((await requisitar('/assinatura')).assinatura?.temAcessoPremium); } catch {}
        definirAssinante(premiumAtivo);
        definirDados({ ...filiais, perfilResponsavel: perfil.perfil, premiumAtivo });
      }
      if (secao === 'servicos') { const [filiais, servicos] = await Promise.all([requisitar('/filiais'), requisitar('/servicos')]); definirDados({ filiais: filiais.filiais, servicos: servicos.servicos }); }
      if (secao === 'funcionarios') { const [filiais, servicos, funcionarios] = await Promise.all([requisitar('/filiais'), requisitar('/servicos'), requisitar('/funcionarios')]); definirDados({ filiais: filiais.filiais, servicos: servicos.servicos, funcionarios: funcionarios.funcionarios }); }
      if (secao === 'disponibilidade') definirDados(await requisitar('/filiais'));
      if (secao === 'clientes') definirDados(await requisitar('/clientes'));
      if (secao === 'avaliacoes') definirDados(await requisitar('/filiais'));
      if (secao === 'agendamentos') {
        const [agenda, clientes, filiais, servicos, funcionarios] = await Promise.all([
          requisitar(`/agendamentos?tipo=${tipoAgenda}`), requisitar('/clientes'), requisitar('/filiais'),
          requisitar('/servicos'), requisitar('/funcionarios'),
        ]);
        definirDados({ ...agenda, clientes: clientes.clientes, filiais: filiais.filiais, servicos: servicos.servicos, funcionarios: funcionarios.funcionarios });
      }
    } catch (erro) {
      if (secao === 'dashboard' && erro.status === 404) { roteador.replace('/salao/configuracoes'); return; }
      definirMensagem(erro.message); definirTipoMensagem('erro'); definirDados({});
    } finally { definirCarregando(false); }
  }, [filtrosDashboard, requisitar, roteador, secao, tipoAgenda]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  useEffect(() => {
    if (secao === 'dashboard') return undefined;
    let ativo = true;
    requisitar('/assinatura')
      .then((resultado) => { if (ativo) definirAssinante(Boolean(resultado.assinatura?.temAcessoPremium)); })
      .catch(() => { if (ativo) definirAssinante(false); });
    return () => { ativo = false; };
  }, [requisitar, secao]);

  async function enviarFormulario(evento, caminho, metodo = 'POST', dadosAdicionais = {}) {
    evento.preventDefault(); definirMensagem('');
    const formulario = new FormData(evento.currentTarget);
    const dadosEnvio = { ...Object.fromEntries(formulario.entries()), ...dadosAdicionais };
    if (caminho.includes('/funcionarios')) dadosEnvio.idsServicos = formulario.getAll('idsServicos').map(Number);
    try {
      const resultado = await requisitar(caminho, { method: metodo, body: JSON.stringify(dadosEnvio) });
      const mensagensAdicao = {
        '/filiais': 'Filial adicionada com sucesso.',
        '/servicos': 'Serviço adicionado com sucesso.',
        '/funcionarios': 'Profissional adicionado com sucesso.',
      };
      toastSucesso(metodo === 'POST' ? mensagensAdicao[caminho] ?? resultado.mensagem : resultado.mensagem);
      definirFilialEdicao(null); definirServicoEdicao(null); definirFuncionarioEdicao(null); definirIdFilialProfissional('');
      carregarDados(); return resultado;
    } catch (erro) { toastErro(erro.message); return null; }
  }

  async function excluirItem(caminho, descricao) {
    if (!window.confirm(`Deseja remover ${descricao}? O histórico de agendamentos será preservado.`)) return;
    try { const resultado = await requisitar(caminho, { method: 'DELETE' }); toastSucesso(resultado.mensagem); definirFilialEdicao(null); definirServicoEdicao(null); definirFuncionarioEdicao(null); carregarDados(); } catch (erro) { toastErro(erro.message); }
  }

  async function excluirConta() {
    try {
      await requisitar('/conta', { method: 'DELETE' });
      limparSessao('salao');
      roteador.replace('/');
      return true;
    } catch (erro) {
      toastErro(erro.message);
      return false;
    }
  }

  async function sairDaConta() {
    if (saindo) return;
    definirSaindo(true);
    try { await requisitar('/logout', { method: 'POST' }); } catch {}
    finally { limparSessao('salao'); roteador.replace('/salao'); }
  }

  async function buscarCep(valorCep) {
    const cep = String(valorCep ?? '').replace(/\D/g, ''); if (cep.length !== 8) return null;
    try { const endereco = await requisitar(`/enderecos/${cep}`); definirDados((dadosAtuais) => ({ ...dadosAtuais, enderecoCep: endereco })); return endereco; } catch (erro) { toastErro(erro.message); return null; }
  }
  async function buscarCoordenadas(cep, numero) { try { return await requisitar(`/coordenadas?cep=${encodeURIComponent(cep)}&numero=${encodeURIComponent(numero)}`); } catch (erro) { toastErro(erro.message); return null; } }
  async function aoSalvarAgendamento(mensagemSucesso) {
    try {
      const [agenda, clientes] = await Promise.all([requisitar(`/agendamentos?tipo=${tipoAgenda}`), requisitar('/clientes')]);
      definirDados((atuais) => ({ ...atuais, ...agenda, clientes: clientes.clientes }));
      toastSucesso(mensagemSucesso);
    } catch (erro) { toastErro(erro.message); }
  }
  const enderecoCep = dados.enderecoCep ?? filialEdicao ?? {};
  return (
    <main className="area-salao">
      <header className="cabecalho-area">
        <Link className="marca" href="/"><span className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link>
        <p className="titulo-area-salao">Painel do salão</p>
        <div className="acoes-cabecalho-salao">
          {assinante ? (
            <Link aria-label={`Notificações${notificacoesNaoLidas > 0 ? `, ${notificacoesNaoLidas} não lidas` : ''}`} className={`botao-notificacoes${secao === 'notificacoes' ? ' botao-notificacoes--ativo' : ''}`} href="/salao/notificacoes" title="Notificações">
              <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
              {notificacoesNaoLidas > 0 && <span className="botao-notificacoes__contador">{notificacoesNaoLidas > 99 ? '99+' : notificacoesNaoLidas}</span>}
            </Link>
          ) : (
            <button aria-label="Notificações" className="botao-notificacoes botao-notificacoes--premium" onClick={mostrarAvisoPremium} title="Notificações disponíveis para assinantes Premium" type="button">
              <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
            </button>
          )}
          <Link className={['botao-assinatura', secao === 'assinatura' && 'botao-assinatura--ativo', assinante && 'botao-assinatura--assinante'].filter(Boolean).join(' ')} href="/salao/assinatura">{assinante ? 'Assinante' : 'Assinatura'}</Link>
          <span data-alternador-tema-destino />
          <button className="botao-secundario botao-sair-area" disabled={saindo} onClick={sairDaConta} type="button">{saindo ? 'Saindo...' : 'Sair'}</button>
        </div>
      </header>
      <div className="estrutura-salao">
        <aside className="menu-salao">{navegacao.map(([chave, titulo, caminho]) => <Link className={secao === chave ? 'menu-salao__ativo' : ''} href={caminho} key={chave}>{titulo}</Link>)}</aside>
        <section className={`conteudo-salao${secao === 'dashboard' ? ' conteudo-salao--dashboard' : ''}${secao === 'filiais' ? ' conteudo-salao--filiais' : ''}`}>
          {carregando ? <p className="estado-lista">Carregando...</p> : (
            <ConteudoSalao
              dados={dados}
              enderecoCep={enderecoCep}
              enviarFormulario={enviarFormulario}
              excluirConta={excluirConta}
              excluirItem={excluirItem}
              buscarCep={buscarCep}
              buscarCoordenadas={buscarCoordenadas}
              filialEdicao={filialEdicao}
              definirFilialEdicao={definirFilialEdicao}
              requisitar={requisitar}
              servicoEdicao={servicoEdicao}
              definirServicoEdicao={definirServicoEdicao}
              funcionarioEdicao={funcionarioEdicao}
              definirFuncionarioEdicao={definirFuncionarioEdicao}
              idFilialProfissional={idFilialProfissional}
              definirIdFilialProfissional={definirIdFilialProfissional}
              secao={secao}
              tipoAgenda={tipoAgenda}
              definirTipoAgenda={definirTipoAgenda}
              notificacoes={notificacoes}
              notificacoesNaoLidas={notificacoesNaoLidas}
              marcarNotificacaoLida={marcarNotificacaoLida}
              marcarTodasNotificacoesLidas={marcarTodasNotificacoesLidas}
              filtrosDashboard={filtrosDashboard}
              definirFiltrosDashboard={definirFiltrosDashboard}
              mostrarToastErro={mostrarToastErro}
              aoAtivarPremium={() => definirAssinante(true)}
              aoSalvarAgendamento={aoSalvarAgendamento}
            />
          )}
        </section>
      </div>

    </main>
  );
}

function LinkToastNotificacao({ aoAbrir, notificacao }) {
  return <Link className="toast-notificacao-link" href="/salao/notificacoes" onClick={aoAbrir}><strong>{notificacao.titulo}</strong><span>{notificacao.mensagem}</span><small>Abrir central de notificações</small></Link>;
}

function ConteudoSalao(propriedades) {
  const { dados, secao } = propriedades;
  if (secao === 'dashboard') return <Dashboard dados={dados} {...propriedades} />;
  if (secao === 'notificacoes') return dados.premiumAtivo
    ? <CentralNotificacoes notificacoes={propriedades.notificacoes} notificacoesNaoLidas={propriedades.notificacoesNaoLidas} marcarNotificacaoLida={propriedades.marcarNotificacaoLida} marcarTodasNotificacoesLidas={propriedades.marcarTodasNotificacoesLidas} mostrarToastErro={propriedades.mostrarToastErro} />
    : <><p className="sobretitulo">Recurso Premium</p><h1>Central de notificações.</h1><p className="descricao-assinatura">A central de notificações está disponível para assinantes Premium.</p><Link className="botao-assinatura" href="/salao/assinatura">Conhecer o Premium</Link></>;
  if (secao === 'assinatura') return <Assinatura aoAtivarPremium={propriedades.aoAtivarPremium} dados={dados} requisitar={propriedades.requisitar} />;
  if (secao === 'configuracoes') return <Configuracoes excluirConta={propriedades.excluirConta} perfil={dados.perfil} premiumAtivo={dados.premiumAtivo} requisitar={propriedades.requisitar} salao={dados.salao} />;
  if (secao === 'filiais') return <Filiais dados={dados} {...propriedades} />;
  if (secao === 'servicos') return <Servicos dados={dados} {...propriedades} />;
  if (secao === 'funcionarios') return <Funcionarios dados={dados} {...propriedades} />;
  if (secao === 'disponibilidade') return <DisponibilidadeSalao filiais={dados.filiais} mostrarToastErro={propriedades.mostrarToastErro} requisitar={propriedades.requisitar} />;
  if (secao === 'clientes') return <><p className="sobretitulo">Relacionamento</p><h1>Clientes que já passaram por aqui.</h1><ListaSimples itens={dados.clientes} campo="nome" vazio="Os clientes aparecerão após os primeiros agendamentos." /></>;
  if (secao === 'avaliacoes') return <AvaliacoesSalao filiais={dados.filiais} requisitar={propriedades.requisitar} />;
  return <AgendaSalao dados={dados} {...propriedades} />;
}

function CentralNotificacoes({ notificacoes, notificacoesNaoLidas, marcarNotificacaoLida, marcarTodasNotificacoesLidas, mostrarToastErro }) {

  async function marcarTodas() {
    try {
      await marcarTodasNotificacoesLidas();
    } catch (falha) { mostrarToastErro(falha.message); }
  }

  return <><p className="sobretitulo">Central do salão</p><h1>Notificações.</h1><div className="central-notificacoes__cabecalho"><p>{notificacoesNaoLidas ? `${notificacoesNaoLidas} não lida${notificacoesNaoLidas === 1 ? '' : 's'}` : 'Tudo em dia'}</p>{notificacoesNaoLidas > 0 && <button className="botao-secundario" onClick={marcarTodas} type="button">Marcar todas como lidas</button>}</div><p className="central-notificacoes__ajuda">Não está recebendo notificações? <Link href="/salao/configuracoes">Registre seu dispositivo nas configurações.</Link></p>{notificacoes.length ? <div className="central-notificacoes__lista">{notificacoes.map((notificacao) => <article className={`central-notificacao${notificacao.lida ? '' : ' central-notificacao--nao-lida'}`} key={notificacao.id}><span aria-hidden="true" className="central-notificacao__indicador" /><div><strong>{notificacao.titulo}</strong><p>{notificacao.mensagem}</p><small>{new Date(notificacao.criadaEm).toLocaleString('pt-BR')}</small></div><div className="central-notificacao__acoes">{!notificacao.lida && <button className="botao-secundario" onClick={() => marcarNotificacaoLida(notificacao.id).catch((falha) => mostrarToastErro(falha.message))} type="button">Marcar como lida</button>}<Link href={notificacao.link || '/salao/agendamentos'} onClick={() => marcarNotificacaoLida(notificacao.id).catch((falha) => mostrarToastErro(falha.message))}>Ver agenda</Link></div></article>)}</div> : <p className="estado-lista">As novas reservas, alterações e cancelamentos aparecerão aqui.</p>}</>;
}

function Configuracoes({ excluirConta, perfil, premiumAtivo, requisitar, salao }) {
  const [dadosPerfil, definirDadosPerfil] = useState({ nome: perfil?.nome ?? '', telefone: formatarTelefone(perfil?.telefone), dataNascimento: dataParaExibicao(perfil?.dataNascimento), documento: formatarCnpj(perfil?.documento) });
  const [nomeSalao, definirNomeSalao] = useState(salao?.nome ?? '');
  const [senhas, definirSenhas] = useState({ senha: '', confirmacaoSenha: '' });
  const [confirmacao, definirConfirmacao] = useState('');
  const [excluindo, definirExcluindo] = useState(false);
  const podeExcluir = confirmacao === 'EXCLUIR MINHA CONTA';

  useEffect(() => { definirDadosPerfil({ nome: perfil?.nome ?? '', telefone: formatarTelefone(perfil?.telefone), dataNascimento: dataParaExibicao(perfil?.dataNascimento), documento: formatarCnpj(perfil?.documento) }); }, [perfil]);
  useEffect(() => { definirNomeSalao(salao?.nome ?? ''); }, [salao]);

  async function salvarPerfil(evento) {
    evento.preventDefault();
    try { const resultado = await requisitar('/perfil', { method: 'PATCH', body: JSON.stringify({ ...dadosPerfil, tipoDocumento: 'CNPJ', dataNascimento: dataParaIso(dadosPerfil.dataNascimento) }) }); toastSucesso(resultado.mensagem); }
    catch (erro) { toastErro(erro.message); }
  }

  async function salvarSalao(evento) {
    evento.preventDefault();
    try { const resultado = await requisitar('/saloes/atual', { method: 'PATCH', body: JSON.stringify({ nome: nomeSalao }) }); toastSucesso(resultado.mensagem); }
    catch (erro) { toastErro(erro.message); }
  }

  async function salvarSenha(evento) {
    evento.preventDefault();
    try { const resultado = await requisitar('/senha', { method: 'PATCH', body: JSON.stringify(senhas) }); toastSucesso(resultado.mensagem); definirSenhas({ senha: '', confirmacaoSenha: '' }); }
    catch (erro) { toastErro(erro.message); }
  }

  async function confirmarExclusao() {
    if (!podeExcluir || !window.confirm('Esta ação é irreversível. Deseja excluir a conta e todos os dados do salão?')) return;
    definirExcluindo(true); const excluida = await excluirConta(); if (!excluida) definirExcluindo(false);
  }

  return <><p className="sobretitulo">Configurações</p><h1>Sua conta.</h1><section className="secao-configuracoes"><h2>Informações da conta</h2><form className="grade-formulario" onSubmit={salvarPerfil}><label className="campo-formulario"><span>Nome do responsável</span><input onChange={(evento) => definirDadosPerfil({ ...dadosPerfil, nome: evento.target.value })} required value={dadosPerfil.nome} /></label><label className="campo-formulario"><span>Telefone do responsável</span><input autoComplete="tel" inputMode="numeric" onChange={(evento) => definirDadosPerfil({ ...dadosPerfil, telefone: formatarTelefone(evento.target.value) })} required value={dadosPerfil.telefone} /></label><label className="campo-formulario"><span>Data de nascimento</span><input inputMode="numeric" maxLength="10" onChange={(evento) => definirDadosPerfil({ ...dadosPerfil, dataNascimento: formatarData(evento.target.value) })} placeholder="DD/MM/AAAA" required value={dadosPerfil.dataNascimento} /></label><label className="campo-formulario"><span>CNPJ da empresa</span><input autoComplete="organization" onChange={(evento) => definirDadosPerfil({ ...dadosPerfil, documento: formatarCnpj(evento.target.value) })} required value={dadosPerfil.documento} /></label><button className="botao-enviar">Salvar informações →</button></form></section><section className="secao-configuracoes"><h2>Dados do salão</h2><form className="grade-formulario" onSubmit={salvarSalao}><label className="campo-formulario"><span>Nome do salão</span><input onChange={(evento) => definirNomeSalao(evento.target.value)} required value={nomeSalao} /></label><button className="botao-enviar">Salvar nome do salão →</button></form></section>{premiumAtivo && <section className="secao-configuracoes"><h2>Notificações do dispositivo</h2><GerenciarNotificacoes requisitar={requisitar} /></section>}<section className="secao-configuracoes"><h2>Alterar senha</h2><form className="grade-formulario" onSubmit={salvarSenha}><CampoSenha aoMudar={(evento) => definirSenhas({ ...senhas, senha: evento.target.value })} id="novaSenhaSalao" nome="novaSenhaSalao" rotulo="Nova senha" valor={senhas.senha} /><CampoSenha aoMudar={(evento) => definirSenhas({ ...senhas, confirmacaoSenha: evento.target.value })} id="confirmacaoSenhaSalao" nome="confirmacaoSenhaSalao" rotulo="Confirme a nova senha" valor={senhas.confirmacaoSenha} /><button className="botao-enviar">Alterar senha →</button></form></section><section className="zona-perigo"><div><strong>Excluir conta permanentemente</strong><p>Isso remove o salão, filiais, profissionais, serviços, horários, agendamentos, pagamentos e o acesso da conta. Não é possível desfazer.</p>{perfil?.email && <small>Conta: {perfil.email}</small>}</div><label className="campo-formulario"><span>Digite <b>EXCLUIR MINHA CONTA</b> para confirmar</span><input disabled={excluindo} onChange={(evento) => definirConfirmacao(evento.target.value)} value={confirmacao} /></label><button className="botao-perigo" disabled={!podeExcluir || excluindo} onClick={confirmarExclusao} type="button">{excluindo ? 'Excluindo conta...' : 'Excluir minha conta'}</button></section></>;
}

function GerenciarNotificacoes({ requisitar }) {
  const [ativa, definirAtiva] = useState(false);
  const [processando, definirProcessando] = useState(true);
  const [permissao, definirPermissao] = useState('default');

  useEffect(() => {
    let ativo = true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      toastAviso('Este navegador não oferece suporte a notificações push.');
      definirProcessando(false);
      return () => { ativo = false; };
    }
    definirPermissao(Notification.permission);
    navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((inscricao) => requisitar(`/notificacoes/inscricao?endpoint=${encodeURIComponent(inscricao?.endpoint ?? '')}`))
      .then((resultado) => {
        if (!ativo) return;
        definirAtiva(Boolean(resultado.ativa));
        if (!resultado.ativa && Notification.permission === 'granted') toastInfo('A permissão está liberada, mas este dispositivo ainda não está registrado. Use o botão abaixo para concluir.');
        if (Notification.permission === 'denied') toastAviso('O navegador bloqueou as notificações. Libere a permissão nas configurações deste site.');
      })
      .catch((erro) => { if (ativo) toastErro(erro.message); })
      .finally(() => { if (ativo) definirProcessando(false); });
    return () => { ativo = false; };
  }, [requisitar]);

  async function alternarNotificacoes() {
    definirProcessando(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      let inscricao = await registro.pushManager.getSubscription();
      if (ativa) {
        if (inscricao) {
          await requisitar('/notificacoes/inscricao', { method: 'DELETE', body: JSON.stringify({ endpoint: inscricao.endpoint }) });
          await inscricao.unsubscribe();
        }
        definirAtiva(false);
        toastSucesso('Notificações desativadas neste dispositivo.');
        return;
      }
      if (!('Notification' in window) || !('PushManager' in window)) throw new Error('Este navegador não oferece suporte a notificações push.');
      const permissao = await Notification.requestPermission();
      definirPermissao(permissao);
      if (permissao !== 'granted') throw new Error(permissao === 'denied' ? 'As notificações estão bloqueadas nas permissões do navegador.' : 'Permita notificações para ativá-las.');
      const { chavePublica } = await requisitar('/notificacoes/chave-publica');
      const chaveBase64 = chavePublica.replace(/-/g, '+').replace(/_/g, '/');
      const chave = Uint8Array.from(atob(chaveBase64 + '='.repeat((4 - (chaveBase64.length % 4)) % 4)), (caractere) => caractere.charCodeAt(0));
      inscricao ??= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
      await requisitar('/notificacoes/inscricao', { method: 'POST', body: JSON.stringify(inscricao.toJSON()) });
      definirAtiva(true);
      toastSucesso('Notificações ativadas neste dispositivo.');
    } catch (erro) {
      toastErro(erro.message || 'Não foi possível alterar as notificações.');
    } finally {
      definirProcessando(false);
    }
  }

  return <section className="notificacoes-dispositivo"><div><strong>Notificações neste dispositivo</strong><p>Receba um aviso quando um cliente agendar, cancelar ou alterar um horário.</p></div><button className="botao-secundario" disabled={processando} onClick={alternarNotificacoes} type="button">{processando ? 'Verificando...' : ativa ? 'Desativar notificações' : permissao === 'granted' ? 'Registrar este dispositivo' : 'Ativar notificações'}</button></section>;
}

function DashboardPremium({ dados, filtrosDashboard, definirFiltrosDashboard, requisitar }) {
  const resumo = dados.resumo ?? {};
  const dinheiro = (valor) => Number(valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const anterior = dados.comparacaoAnterior ?? {};
  const ticketMedio = Number(resumo.atendimentosRealizados) ? Number(resumo.receitaRealizada) / Number(resumo.atendimentosRealizados) : 0;
  const ticketMedioAnterior = Number(anterior.atendimentosRealizados) ? Number(anterior.receitaRealizada) / Number(anterior.atendimentosRealizados) : 0;
  const taxaCancelamento = Number(resumo.quantidadeAgendamentosElegiveis) ? (Number(resumo.quantidadeAgendamentosCancelados) / Number(resumo.quantidadeAgendamentosElegiveis)) * 100 : 0;
  const taxaCancelamentoAnterior = Number(anterior.quantidadeAgendamentosElegiveis) ? (Number(anterior.quantidadeAgendamentosCancelados) / Number(anterior.quantidadeAgendamentosElegiveis)) * 100 : 0;
  const periodoAnterior = dados.periodoComparacao ?? {};
  const formatarVariacao = (valor, base) => base ? `${valor > base ? '+' : ''}${(((valor - base) / base) * 100).toFixed(1).replace('.', ',')}%` : (valor ? 'Sem base anterior' : '0%');
  return <div className="dashboard-premium">
    <div className="dashboard-premium__cabecalho"><div><p className="sobretitulo">Agende Aki Pro</p><h1>Seu salão, em números.</h1><p>Visão operacional de {filtrosDashboard.dataInicio} a {filtrosDashboard.dataFim}, comparada com {periodoAnterior.dataInicioAnterior} a {periodoAnterior.dataFimAnterior}.</p></div><div className="dashboard-premium__acoes"><span>PRO</span><button className="botao-secundario" onClick={() => exportarDashboardCsv(dados, filtrosDashboard)} type="button">Exportar CSV</button><button className="botao-secundario" onClick={() => window.print()} type="button">Exportar PDF</button></div></div>
    <div className="filtros-dashboard"><Campo nome="dataInicio" rotulo="De" tipo="date" valor={filtrosDashboard.dataInicio} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, dataInicio: evento.target.value })} obrigatorio={false} /><Campo nome="dataFim" rotulo="Até" tipo="date" valor={filtrosDashboard.dataFim} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, dataFim: evento.target.value })} obrigatorio={false} /><SelectCampo rotulo="Filial" valor={filtrosDashboard.idUnidade} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, idUnidade: evento.target.value })} opcoes={dados.opcoesFiltros?.filiais} chave="idUnidade" /><SelectCampo rotulo="Serviço" valor={filtrosDashboard.idServico} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, idServico: evento.target.value })} opcoes={dados.opcoesFiltros?.servicos} chave="idServico" /><SelectCampo rotulo="Profissional" valor={filtrosDashboard.idFuncionario} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, idFuncionario: evento.target.value })} opcoes={dados.opcoesFiltros?.funcionarios} chave="idFuncionario" /><button className="botao-secundario" onClick={() => definirFiltrosDashboard(filtrosIniciais)} type="button">Limpar filtros</button></div>
    <div className="grade-indicadores dashboard-premium__indicadores">
      <IndicadorComparado titulo="Receita realizada" valor={dinheiro(resumo.receitaRealizada)} variacao={formatarVariacao(Number(resumo.receitaRealizada), Number(anterior.receitaRealizada))} />
      <Indicador titulo="Receita prevista · próximos 30 dias" valor={dinheiro(resumo.receitaPrevista)} />
      <IndicadorComparado titulo="Ticket médio realizado" valor={dinheiro(ticketMedio)} variacao={formatarVariacao(ticketMedio, ticketMedioAnterior)} />
      <IndicadorComparado titulo="Agendamentos no período" valor={resumo.quantidadeAgendamentosTotal ?? 0} variacao={formatarVariacao(Number(resumo.quantidadeAgendamentosTotal), Number(anterior.quantidadeAgendamentosTotal))} />
      <IndicadorComparado titulo="Taxa de cancelamento" valor={`${taxaCancelamento.toFixed(1).replace('.', ',')}%`} variacao={`${(taxaCancelamento - taxaCancelamentoAnterior > 0 ? '+' : '')}${(taxaCancelamento - taxaCancelamentoAnterior).toFixed(1).replace('.', ',')} p.p.`} inverso />
      <Indicador titulo="Atendimentos realizados" valor={resumo.quantidadeAgendamentosRealizados ?? 0} />
      <Indicador titulo="Agendamentos cancelados" valor={resumo.quantidadeAgendamentosCancelados ?? 0} variante="neutra" />
      <Indicador titulo="Não compareceram" valor={resumo.quantidadeNaoCompareceu ?? 0} variante="neutra" />
    </div>
    <div className="dashboard-premium__graficos">
      <section className="secao-painel"><h2>Evolução da receita</h2><p>Valor dos serviços concluídos, pela data em que foram marcados como realizados.</p><GraficoLinha dados={dados.receitaPorDia ?? []} campo="valor" cor="var(--ameixa)" vazio="Nenhum serviço realizado neste período." /></section>
      <section className="secao-painel"><h2>Receita por serviço</h2><p>Valor dos serviços realizados no período.</p><GraficoBarras dados={dados.receitaPorServico ?? []} campo="servico" valor="valor" formatar={dinheiro} vazio="Nenhum serviço realizado para estes filtros." /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Cancelamentos por motivo</h2><p>Distribuição dos agendamentos cancelados no período e nos filtros selecionados.</p><GraficoBarras dados={dados.cancelamentosPorMotivo ?? []} campo="motivo" valor="quantidade" formatar={(quantidade) => `${quantidade} ${Number(quantidade) === 1 ? 'agendamento' : 'agendamentos'}`} vazio="Nenhum cancelamento para estes filtros." /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Evolução dos agendamentos</h2><p>Todos os agendamentos pela data de início.</p><GraficoLinha dados={dados.agendamentosPorDia ?? []} campo="quantidade" cor="var(--verde-escuro, #397b61)" vazio="Nenhum agendamento para estes filtros." /><DistribuicaoStatus resumo={resumo} /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Demanda por dia e horário</h2><p>Agendamentos concluídos ou marcados; cancelamentos aparecem no detalhe de cada célula.</p><MapaCalor dados={dados.mapaCalor ?? []} /></section>
      <section className="secao-painel"><h2>Clientes atendidos</h2><p>Novos e recorrentes pela primeira visita concluída registrada no salão.</p><div className="dashboard-premium__cliente-metricas"><Indicador titulo="Clientes atendidos" valor={dados.clientes?.clientesAtendidos ?? 0} /><Indicador titulo="Novos clientes" valor={dados.clientes?.clientesNovos ?? 0} /><Indicador titulo="Clientes recorrentes" valor={dados.clientes?.clientesRecorrentes ?? 0} /></div></section>
      <section className="secao-painel"><h2>Desempenho dos profissionais</h2><p>Atendimentos e valores dos serviços realizados; ocupação comparada à disponibilidade semanal cadastrada.</p><TabelaProfissionais profissionais={dados.profissionais ?? []} dinheiro={dinheiro} /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Insights do negócio</h2><p>Sugestões geradas por regras aplicadas aos dados deste período.</p><ListaInsights insights={dados.insights ?? []} /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Clientes sem retorno há 90 dias</h2><p>Clientes com atendimento realizado, sem novo atendimento concluído nos últimos 90 dias.</p><TabelaClientesInativos clientes={dados.clientesInativos ?? []} /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Análise de agendamentos</h2><p>Inclui todos os status. Agendamentos entram pela data marcada; cancelamentos, pela data do cancelamento. Aplicam-se os filtros selecionados.</p><TabelaAnaliseAgendamentos agendamentos={dados.analiseAgendamentos ?? []} dinheiro={dinheiro} /></section>
    </div>
    <small className="dashboard-premium__nota">Receita realizada soma o valor dos serviços marcados como realizados, pela data da confirmação. O pagamento continua sendo controlado separadamente. A receita prevista considera os agendamentos futuros ativos.</small>
    <small className="dashboard-premium__nota">Clientes novos são os que tiveram seu primeiro atendimento marcado como realizado no período. Recorrentes são os que já tinham ao menos um atendimento realizado antes do período. Clientes inativos são os que estão há 90 dias sem atendimento realizado. A disponibilidade profissional é uma estimativa baseada na grade semanal e não desconta feriados nem bloqueios pontuais.</small>
  </div>;
}

function exportarDashboardCsv(dados, filtros) {
  const linhas = [
    ['Relatório Agende Aki Pro'],
    ['Período', filtros.dataInicio, filtros.dataFim],
    [],
    ['Indicadores', 'Valor'],
    ['Receita realizada', dados.resumo?.receitaRealizada],
    ['Receita prevista próximos 30 dias', dados.resumo?.receitaPrevista],
    ['Agendamentos', dados.resumo?.quantidadeAgendamentosTotal],
    ['Atendimentos realizados', dados.resumo?.quantidadeAgendamentosRealizados],
    ['Cancelamentos', dados.resumo?.quantidadeAgendamentosCancelados],
    ['Não compareceram', dados.resumo?.quantidadeNaoCompareceu],
    [],
    ['Cancelamentos por motivo', 'Quantidade'],
    ...(dados.cancelamentosPorMotivo ?? []).map((item) => [item.motivo, item.quantidade]),
    [],
    ['Agendamento', 'Data', 'Cliente', 'Email', 'Telefone', 'Serviço', 'Filial', 'Profissional', 'Status', 'Valor', 'Pagamento', 'Motivo', 'Detalhe do cancelamento', 'Origem'],
    ...(dados.analiseAgendamentos ?? []).map((item) => [item.idAgendamento, item.dataInicio, item.cliente, item.email, item.telefone, item.servico, item.unidade, item.profissional, item.status, item.valor, item.statusPagamento, item.motivoCancelamento, item.detalheCancelamento, item.origemCancelamento]),
    [],
    ['Receita por serviço', 'Valor atual', 'Valor período anterior'],
    ...(dados.receitaPorServico ?? []).map((item) => [item.servico, item.valor, (dados.receitaPorServicoAnterior ?? []).find((anterior) => anterior.servico === item.servico)?.valor ?? 'Fora do top 8 no período anterior']),
    [],
    ['Profissionais', 'Atendimentos realizados', 'Receita confirmada', 'Ticket médio', 'Cancelamentos', 'Ocupação estimada (%)'],
    ...(dados.profissionais ?? []).map((item) => [item.profissional, item.atendimentosRealizados, item.receitaRealizada, item.ticketMedio, item.cancelamentos, item.ocupacaoEstimada]),
    [],
    ['Clientes inativos (até 20)', 'Email', 'Telefone', 'Último atendimento'],
    ...(dados.clientesInativos ?? []).map((item) => [item.cliente, item.email, item.telefone, item.ultimoAtendimento]),
    [],
    ['Insights', 'Descrição'],
    ...(dados.insights ?? []).map((item) => [item.titulo, item.descricao]),
  ];
  const escapar = (valor) => {
    const texto = String(valor ?? '');
    const protegido = /^[\s]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
    return `"${protegido.replaceAll('"', '""')}"`;
  };
  const conteudo = `\uFEFF${linhas.map((linha) => linha.map(escapar).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `dashboard-pro-${filtros.dataInicio}-${filtros.dataFim}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function ListaInsights({ insights }) {
  if (!insights.length) return <p className="dashboard-premium__vazio">Nenhum insight disponível para estes filtros.</p>;
  return <div className="lista-insights">{insights.map((insight, indice) => <article className={`lista-insights__item lista-insights__item--${insight.tipo}`} key={`${insight.titulo}-${indice}`}><strong>{insight.titulo}</strong><p>{insight.descricao}</p></article>)}</div>;
}

function TabelaClientesInativos({ clientes }) {
  if (!clientes.length) return <p className="dashboard-premium__vazio">Nenhum cliente atingiu 90 dias sem atendimento realizado.</p>;
  return <div className="tabela-premium__rolagem"><table className="tabela-premium"><thead><tr><th>Cliente</th><th>Email</th><th>Telefone</th><th>Último atendimento</th></tr></thead><tbody>{clientes.map((cliente) => <tr key={cliente.idCliente}><th>{cliente.cliente}</th><td>{cliente.email || '—'}</td><td>{cliente.telefone || '—'}</td><td>{formatarDataHora(cliente.ultimoAtendimento)}</td></tr>)}</tbody></table></div>;
}

function TabelaAnaliseAgendamentos({ agendamentos, dinheiro }) {
  if (!agendamentos.length) return <p className="dashboard-premium__vazio">Nenhum agendamento encontrado para estes filtros.</p>;
  const statusLegivel = { AGENDADO: 'Agendado', REALIZADO: 'Realizado', CANCELADO: 'Cancelado', NAO_COMPARECEU: 'Não compareceu' };
  const pagamentoLegivel = { PENDENTE: 'Pendente', APROVADO: 'Aprovado', RECUSADO: 'Recusado', CANCELADO: 'Cancelado', REEMBOLSADO: 'Reembolsado' };
  const origemLegivel = { CLIENTE: 'Cliente', SALAO: 'Salão', NAO_IDENTIFICADO: 'Não identificada' };
  return <div className="tabela-premium__rolagem"><table className="tabela-premium tabela-premium--agendamentos"><thead><tr><th>#</th><th>Data</th><th>Cliente</th><th>Contato</th><th>Serviço</th><th>Filial</th><th>Profissional</th><th>Status</th><th>Valor</th><th>Pagamento</th><th>Motivo do cancelamento</th><th>Cancelado por</th></tr></thead><tbody>{agendamentos.map((item) => <tr key={item.idAgendamento}><td>{item.idAgendamento}</td><td>{formatarDataHora(item.dataInicio)}</td><th>{item.cliente}</th><td>{[item.email, item.telefone].filter(Boolean).join(' · ') || '—'}</td><td>{item.servico}</td><td>{item.unidade}</td><td>{item.profissional}</td><td><span className={`status-agendamento status-agendamento--${String(item.status).toLowerCase()}`}>{statusLegivel[item.status] ?? item.status}</span></td><td>{dinheiro(item.valor)}</td><td>{pagamentoLegivel[item.statusPagamento] ?? '—'}</td><td>{item.status === 'CANCELADO' ? [item.motivoCancelamento, item.detalheCancelamento].filter(Boolean).join(': ') || 'Sem motivo informado' : '—'}</td><td>{origemLegivel[item.origemCancelamento] ?? '—'}</td></tr>)}</tbody></table></div>;
}

function IndicadorComparado({ titulo, valor, variacao, inverso = false }) {
  const diferenca = Number.parseFloat(variacao.replace(',', '.'));
  const desfavoravel = inverso ? diferenca > 0 : diferenca < 0;
  return <article className="indicador indicador--comparado"><span>{titulo}</span><strong>{valor}</strong><small className={desfavoravel ? 'indicador__variacao indicador__variacao--negativa' : 'indicador__variacao'}>{variacao} vs. período anterior</small></article>;
}

function DistribuicaoStatus({ resumo }) {
  const itens = [
    ['Realizados', Number(resumo.quantidadeAgendamentosRealizados ?? 0)],
    ['Marcados', Number(resumo.quantidadeAgendamentosMarcados ?? 0)],
    ['Cancelados', Number(resumo.quantidadeAgendamentosCancelados ?? 0)],
    ['Não presentes', Number(resumo.quantidadeNaoCompareceu ?? 0)],
  ];
  const total = Math.max(Number(resumo.quantidadeAgendamentosTotal ?? 0), 1);
  return <div className="dashboard-premium__status">{itens.map(([rotulo, quantidade]) => <div key={rotulo}><span>{rotulo}</span><div><i style={{ width: `${(quantidade / total) * 100}%` }} /></div><b>{quantidade}</b></div>)}</div>;
}

function MapaCalor({ dados }) {
  if (!dados.length) return <p className="dashboard-premium__vazio">Nenhum agendamento para estes filtros.</p>;
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const maximo = Math.max(...dados.map((item) => Number(item.quantidade ?? 0)), 1);
  const quantidades = new Map(dados.map((item) => [`${item.diaSemana}-${item.hora}`, item]));
  return <div className="mapa-calor__rolagem"><div className="mapa-calor" style={{ gridTemplateColumns: '42px repeat(24, minmax(19px, 1fr))' }}><span />{Array.from({ length: 24 }, (_, hora) => <span className="mapa-calor__hora" key={hora}>{hora}</span>)}{dias.map((dia, diaSemana) => <Fragment key={dia}><strong>{dia}</strong>{Array.from({ length: 24 }, (_, hora) => { const item = quantidades.get(`${diaSemana}-${hora}`); const quantidade = Number(item?.quantidade ?? 0); const cancelados = Number(item?.cancelados ?? 0); return <span aria-label={`${dia}, ${hora}h: ${quantidade} agendamentos, ${cancelados} cancelados`} className="mapa-calor__celula" key={hora} style={{ backgroundColor: quantidade ? `rgba(116, 68, 95, ${0.12 + (quantidade / maximo) * 0.78})` : undefined }} title={`${dia}, ${hora}:00 — ${quantidade} agendamentos, ${cancelados} cancelados`} />; })}</Fragment>)}</div></div>;
}

function TabelaProfissionais({ profissionais, dinheiro }) {
  if (!profissionais.length) return <p className="dashboard-premium__vazio">Nenhum profissional encontrado para estes filtros.</p>;
  return <div className="tabela-premium__rolagem"><table className="tabela-premium"><thead><tr><th>Profissional</th><th>Realizados</th><th>Receita</th><th>Ticket médio</th><th>Cancelados</th><th>Ocupação estimada</th></tr></thead><tbody>{profissionais.map((profissional) => <tr key={profissional.idFuncionario}><th>{profissional.profissional}</th><td>{profissional.atendimentosRealizados}</td><td>{dinheiro(profissional.receitaRealizada)}</td><td>{dinheiro(profissional.ticketMedio)}</td><td>{profissional.cancelamentos}</td><td>{profissional.ocupacaoEstimada == null ? 'Sem grade' : `${Number(profissional.ocupacaoEstimada).toFixed(1).replace('.', ',')}%`}</td></tr>)}</tbody></table></div>;
}

function GraficoLinha({ dados, campo, cor, vazio }) {
  if (!dados.length) return <p className="dashboard-premium__vazio">{vazio}</p>;
  const valores = dados.map((item) => Number(item[campo] ?? 0));
  const maximo = Math.max(...valores, 1);
  const pontos = valores.map((valor, indice) => `${dados.length === 1 ? 50 : 8 + (indice * 84) / (dados.length - 1)},${92 - (valor / maximo) * 78}`).join(' ');
  return <div className="grafico-linha"><svg aria-label="Gráfico de evolução" role="img" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="5" x2="95" y1="92" y2="92" /><line x1="5" x2="95" y1="53" y2="53" /><line x1="5" x2="95" y1="14" y2="14" /><polyline points={pontos} style={{ stroke: cor }} />{valores.map((valor, indice) => { const x = dados.length === 1 ? 50 : 8 + (indice * 84) / (dados.length - 1); const y = 92 - (valor / maximo) * 78; return <circle key={`${dados[indice].data}-${indice}`} cx={x} cy={y} r="1.3" style={{ fill: cor }} />; })}</svg><div className="grafico-linha__legenda"><span>{dados[0].data}</span><span>{dados[dados.length - 1].data}</span></div></div>;
}

function GraficoBarras({ dados, campo, valor, formatar, vazio }) {
  if (!dados.length) return <p className="dashboard-premium__vazio">{vazio}</p>;
  const maximo = Math.max(...dados.map((item) => Number(item[valor] ?? 0)), 1);
  return <div className="grafico-barras">{dados.map((item) => <div className="grafico-barras__linha" key={item[campo]}><span title={item[campo]}>{item[campo]}</span><div><i style={{ width: `${Math.max(2, (Number(item[valor]) / maximo) * 100)}%` }} /></div><b>{formatar(item[valor])}</b></div>)}</div>;
}

function Dashboard({ dados, filtrosDashboard, definirFiltrosDashboard, requisitar }) {
  if (dados.premiumAtivo) return <DashboardPremium dados={dados} filtrosDashboard={filtrosDashboard} definirFiltrosDashboard={definirFiltrosDashboard} requisitar={requisitar} />;
  const resumo = dados.resumo ?? {};
  return <><p className="sobretitulo">Visão geral</p><h1>Seu salão em movimento.</h1><div className="filtros-dashboard"><Campo nome="dataInicio" rotulo="De" tipo="date" valor={filtrosDashboard.dataInicio} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, dataInicio: evento.target.value })} /><Campo nome="dataFim" rotulo="Até" tipo="date" valor={filtrosDashboard.dataFim} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, dataFim: evento.target.value })} /><SelectCampo rotulo="Filial" valor={filtrosDashboard.idUnidade} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, idUnidade: evento.target.value })} opcoes={dados.opcoesFiltros?.filiais} chave="idUnidade" /><SelectCampo rotulo="Serviço" valor={filtrosDashboard.idServico} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, idServico: evento.target.value })} opcoes={dados.opcoesFiltros?.servicos} chave="idServico" /><SelectCampo rotulo="Profissional" valor={filtrosDashboard.idFuncionario} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, idFuncionario: evento.target.value })} opcoes={dados.opcoesFiltros?.funcionarios} chave="idFuncionario" /><button className="botao-secundario" onClick={() => definirFiltrosDashboard(filtrosIniciais)} type="button">Limpar filtros</button></div><div className="grade-indicadores"><Indicador titulo="Agendamentos ativos" valor={resumo.quantidadeAgendamentosAtivos ?? 0} /><Indicador titulo="Agendamentos cancelados" valor={resumo.quantidadeAgendamentosCancelados ?? 0} variante="neutra" /><Indicador titulo="Não compareceram" valor={resumo.quantidadeNaoCompareceu ?? 0} variante="neutra" /><Indicador titulo="Faturamento previsto" valor={`R$ ${Number(resumo.faturamento ?? 0).toFixed(2).replace('.', ',')}`} /></div><section className="secao-painel"><h2>Serviços mais solicitados</h2><ListaSimples itens={dados.servicosMaisSolicitados} campo="servico" vazio="Ainda não há dados para estes filtros." /></section><section className="secao-painel"><h2>Próximos atendimentos</h2><ListaSimples itens={dados.proximosAtendimentos} campo="cliente" vazio="Nenhum atendimento próximo para estes filtros." /></section></>;
}

function Assinatura({ aoAtivarPremium, dados, requisitar }) {
  const [assinatura, definirAssinatura] = useState(dados.assinatura);
  const [enviando, definirEnviando] = useState('');
  const avisouRetornoCheckout = useRef(false);
  useEffect(() => { definirAssinatura(dados.assinatura); }, [dados.assinatura]);
  const oferta = dados.oferta ?? {};
  const premium = oferta.premium ?? { opcoes: [], recursos: [] };
  const recursosBasicos = oferta.basico?.recursos?.length ? oferta.basico.recursos : ['Dashboard atual', 'Agenda, clientes e gestão do salão', '1 unidade'];
  const recursosPremium = premium.recursos?.length ? premium.recursos : [
    { nome: 'Dashboard avançado', descricao: 'Painel mais detalhado para te auxiliar na tomada de decisão.' },
    { nome: 'Notificações', descricao: 'Receba notificações direto no dispositivo caso o cliente faça um agendamento, cancele ou altere.' },
    { nome: 'Destaque', descricao: 'Ganhe destaque na lista de salões da sua região.' },
    { nome: 'Exportação de dados e relatórios', descricao: 'Exporte seus dados e relatórios.' },
    { nome: 'Unidades ilimitadas', descricao: 'Cadastre e gerencie quantas unidades sua empresa precisar.' },
  ];
  const opcoesPremium = premium.opcoes?.length ? premium.opcoes : [{ periodicidade: 'MENSAL', valor: 29.90 }, { periodicidade: 'ANUAL', valor: 299.00 }];
  const premiumAtivo = assinatura?.temAcessoPremium;
  const modoTeste = Boolean(dados.modoTeste);

  useEffect(() => {
    if (!premiumAtivo || avisouRetornoCheckout.current || typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('checkout') !== 'retorno') return;
    avisouRetornoCheckout.current = true;
    toastInfo('Assinatura ativada. Acesse Configurações para registrar este dispositivo e receber notificações.');
  }, [premiumAtivo]);

  async function assinar(periodicidade) {
    definirEnviando(periodicidade);
    try {
      if (modoTeste) {
        const resultado = await requisitar('/assinatura/ativar', { method: 'POST', body: JSON.stringify({ periodicidade }) });
        definirAssinatura(resultado.assinatura);
        aoAtivarPremium?.();
        toastSucesso(resultado.mensagem);
        toastInfo('Acesse Configurações para registrar este dispositivo e receber notificações.');
        return;
      }
      const resultado = await requisitar('/assinatura/checkout', { method: 'POST', body: JSON.stringify({ periodicidade }) });
      window.location.assign(resultado.checkoutUrl);
    } catch (erro) { toastErro(erro.message); } finally { definirEnviando(''); }
  }

  async function cancelar() {
    if (!window.confirm('Deseja cancelar a renovação do Premium? O acesso permanece até o fim do período já pago.')) return;
    definirEnviando('cancelar');
    try {
      const resultado = await requisitar('/assinatura/cancelar', { method: 'PATCH' });
      toastSucesso(resultado.mensagem); definirAssinatura(resultado.assinatura ?? { ...assinatura, status: 'CANCELAMENTO_AGENDADO' });
    } catch (erro) { toastErro(erro.message); } finally { definirEnviando(''); }
  }

  async function alterarPeriodicidade(periodicidade) {
    definirEnviando(periodicidade);
    try {
      const resultado = await requisitar('/assinatura/periodicidade', { method: 'PATCH', body: JSON.stringify({ periodicidade }) });
      toastSucesso(resultado.mensagem); definirAssinatura({ ...assinatura, periodicidadePendente: periodicidade });
    } catch (erro) { toastErro(erro.message); } finally { definirEnviando(''); }
  }

  async function atualizarStatus() {
    definirEnviando('atualizar');
    try {
      const resultado = await requisitar('/assinatura');
      definirAssinatura(resultado.assinatura);
      if (resultado.assinatura?.temAcessoPremium) aoAtivarPremium?.();
      toastSucesso('Status da assinatura atualizado.');
    } catch (erro) { toastErro(erro.message); } finally { definirEnviando(''); }
  }

  async function cancelarCheckoutPendente() {
    if (!window.confirm('Deseja cancelar este checkout pendente? Depois você poderá iniciar outra contratação.')) return;
    definirEnviando('cancelar-pendente');
    try {
      const resultado = await requisitar('/assinatura/cancelar', { method: 'PATCH' });
      definirAssinatura({ ...assinatura, status: 'CANCELADA', temAcessoPremium: false });
      toastSucesso(resultado.mensagem);
    } catch (erro) { toastErro(erro.message); } finally { definirEnviando(''); }
  }

  const assinaturaPendente = assinatura?.status === 'PENDENTE';
  const assinaturaComProblema = ['PAUSADA', 'PAGAMENTO_PENDENTE'].includes(assinatura?.status);

  return <>
    <p className="sobretitulo">Plano do salão</p>
    <h1>Escolha como crescer.</h1>
    <p className="descricao-assinatura">O Básico mantém sua operação organizada. Com o Premium, você terá recursos avançados assim que forem lançados.</p>

    {assinaturaPendente && <section className="status-assinatura"><div><strong>Checkout em andamento</strong><p>Se você já concluiu o checkout, aguarde a confirmação do Stripe e atualize o status.</p></div><button className="botao-secundario" disabled={Boolean(enviando)} onClick={atualizarStatus} type="button">{enviando === 'atualizar' ? 'Atualizando...' : 'Atualizar status'}</button><button className="botao-secundario" disabled={Boolean(enviando)} onClick={cancelarCheckoutPendente} type="button">{enviando === 'cancelar-pendente' ? 'Cancelando...' : 'Cancelar checkout'}</button></section>}
    {assinaturaComProblema && <section className="status-assinatura"><div><strong>{assinatura.status === 'PAUSADA' ? 'Assinatura pausada' : 'Pagamento pendente'}</strong><p>Verifique a forma de pagamento da assinatura Stripe antes de tentar novamente.</p></div><button className="botao-secundario" disabled={Boolean(enviando)} onClick={atualizarStatus} type="button">{enviando === 'atualizar' ? 'Atualizando...' : 'Atualizar status'}</button></section>}
    {premiumAtivo && <section className="status-assinatura"><div><strong>Premium {assinatura.periodicidade === 'ANUAL' ? 'anual' : 'mensal'}{assinatura.status === 'EM_TESTE' ? ' em teste' : ' ativo'}</strong><p>{assinatura.status === 'CANCELAMENTO_AGENDADO' ? 'A renovação foi cancelada. Você mantém o Premium até o fim do ciclo vigente.' : assinatura.status === 'EM_TESTE' ? 'Seu teste grátis está ativo. A cobrança começa ao final do período de teste.' : assinatura.periodicidadePendente ? `A troca para o plano ${assinatura.periodicidadePendente.toLowerCase()} será feita na próxima renovação.` : 'Sua assinatura está em dia.'}</p>{assinatura.dataProximaCobranca && <small>{assinatura.status === 'CANCELAMENTO_AGENDADO' ? 'Acesso Premium até: ' : assinatura.status === 'EM_TESTE' ? 'Primeira cobrança prevista: ' : 'Próxima renovação: '}{formatarDataAssinatura(assinatura.dataProximaCobranca)}</small>}</div>{assinatura.status !== 'CANCELAMENTO_AGENDADO' && <button className="botao-secundario" disabled={enviando === 'cancelar'} onClick={cancelar} type="button">{enviando === 'cancelar' ? 'Cancelando...' : 'Cancelar renovação'}</button>}</section>}
    <div className="grade-planos">
      <article className="cartao-plano"><p className="sobretitulo">{oferta.basico?.nome ?? 'Básico'}</p><h2>Para organizar a rotina.</h2><strong className="preco-plano">Grátis</strong><ul>{recursosBasicos.map((recurso) => <li key={recurso}>✓ {recurso}</li>)}</ul><span className="plano-atual">{premiumAtivo ? 'Plano disponível' : 'Seu plano atual'}</span></article>
      <article className="cartao-plano cartao-plano--premium"><p className="sobretitulo">{premium.nome ?? 'Premium'}</p><h2>Para acompanhar cada resultado.</h2><p className="titulo-recursos-premium">Incluído no plano</p><ul className="lista-recursos-premium">{recursosPremium.map((recurso) => <li key={recurso.nome}><div><span>{recurso.nome}</span></div>{recurso.descricao && <small>{recurso.descricao}</small>}</li>)}</ul><p className="teste-plano">{premium.testeGratisDias ?? 7} dias grátis para testar</p><div className="opcoes-premium">{opcoesPremium.map((opcao) => { const selecionada = assinatura?.periodicidade === opcao.periodicidade || assinatura?.periodicidadePendente === opcao.periodicidade; return <section key={opcao.periodicidade}><div><strong>R$ {Number(opcao.valor).toFixed(2).replace('.', ',')}</strong><span>por {opcao.periodicidade === 'ANUAL' ? 'ano' : 'mês'}</span></div>{premiumAtivo ? <button className="botao-secundario" disabled={selecionada || Boolean(assinatura?.periodicidadePendente) || enviando === opcao.periodicidade} onClick={() => alterarPeriodicidade(opcao.periodicidade)} type="button">{selecionada ? 'Selecionado' : enviando === opcao.periodicidade ? 'Salvando...' : 'Escolher'}</button> : <button className="botao-enviar" disabled={Boolean(enviando)} onClick={() => assinar(opcao.periodicidade)} type="button">{enviando === opcao.periodicidade ? (modoTeste ? 'Ativando...' : 'Abrindo checkout...') : (modoTeste ? 'Ativar Premium para teste' : 'Assinar com Stripe')}</button>}</section>; })}</div></article>
    </div>
  </>;
}

function Filiais({ dados, enderecoCep, enviarFormulario, excluirItem, buscarCep, buscarCoordenadas, filialEdicao, definirFilialEdicao }) {
  async function copiarLink(filial) {
    const link = `${window.location.origin}/${filial.slugSalao}/${filial.slugFilial}`;
    await navigator.clipboard.writeText(link);
  }
  function compartilharWhatsApp(filial) {
    const link = `${window.location.origin}/${filial.slugSalao}/${filial.slugFilial}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Agende seu horário em ${filial.nome}: ${link}`)}`, '_blank', 'noopener,noreferrer');
  }
  const limiteAtingido = !dados.premiumAtivo && !filialEdicao && (dados.filiais?.length ?? 0) >= 1;
  return <>
    <p className="sobretitulo">Presença local</p>
    <h1>{filialEdicao ? 'Atualize a filial.' : 'Cadastre uma nova filial.'}</h1>
    {limiteAtingido
      ? <section className="secao-painel"><h2>Limite do plano Básico atingido</h2><p>O plano Básico inclui uma unidade. Com o Premium, você pode cadastrar unidades ilimitadas.</p><Link className="botao-assinatura" href="/salao/assinatura">Conhecer o Premium</Link></section>
      : <FormularioFilial buscarCep={buscarCep} buscarCoordenadas={buscarCoordenadas} endereco={enderecoCep} filial={filialEdicao} primeiraFilial={!filialEdicao && !dados.filiais?.length} key={filialEdicao?.idUnidade ?? 'nova'} responsavel={dados.perfilResponsavel} salvarFilial={enviarFormulario} />}
    <CabecalhoLista titulo="Suas filiais" descricao="Selecione uma unidade para alterar os dados, copiar o link de agendamento ou removê-la da descoberta." />
    <div className="grade-gestao">{dados.filiais?.map((filial) => { const paginaAtiva = Number(filial.quantidadeOpcoesAgendamento) > 0; return <article className="cartao-gestao" key={filial.idUnidade}><div><strong>{filial.nome}</strong><span>{filial.categoria} · {filial.municipio}/{filial.estado}</span><small>{filial.rua}, {filial.numero} · {filial.telefone || 'Sem telefone'}</small><small>{filial.email}</small><small>{paginaAtiva ? 'Página de agendamento disponível' : 'Página temporariamente indisponível'}</small></div><div className="acoes-gestao"><button disabled={!paginaAtiva} onClick={() => copiarLink(filial)} type="button">Copiar link</button><button disabled={!paginaAtiva} onClick={() => compartilharWhatsApp(filial)} type="button">WhatsApp</button><AcoesGestao aoEditar={() => definirFilialEdicao(filial)} aoExcluir={() => excluirItem(`/filiais/${filial.idUnidade}`, `a filial “${filial.nome}”`)} /></div></article>; })}</div>
    {!dados.filiais?.length && <p className="estado-lista">Nenhuma filial cadastrada.</p>}
  </>;
}

function Servicos({ dados, enviarFormulario, excluirItem, servicoEdicao, definirServicoEdicao }) { const editando = Boolean(servicoEdicao); return <><p className="sobretitulo">Seu catálogo</p><h1>{editando ? 'Atualize o serviço.' : 'Serviços que encantam.'}</h1><form className="formulario-salao grade-formulario" key={servicoEdicao?.idServico ?? 'novo'} onSubmit={(evento) => enviarFormulario(evento, editando ? `/servicos/${servicoEdicao.idServico}` : '/servicos', editando ? 'PATCH' : 'POST')}><SelectFilial filiais={dados.filiais} valor={servicoEdicao?.idUnidade} /><Campo nome="nome" rotulo="Nome do serviço" valor={servicoEdicao?.nome} /><Campo nome="valor" rotulo="Valor" tipo="number" passo="0.01" valor={servicoEdicao?.valor} /><SelectDuracao valor={servicoEdicao?.duracaoMinutos} /><Campo nome="descricao" rotulo="Descrição" valor={servicoEdicao?.descricao} obrigatorio={false} /><div className="acoes-formulario"><button className="botao-enviar">{editando ? 'Salvar serviço' : 'Adicionar serviço'} <span>→</span></button>{editando && <button className="botao-secundario" onClick={() => definirServicoEdicao(null)} type="button">Cancelar edição</button>}</div></form><CabecalhoLista titulo="Serviços cadastrados" descricao="Seu catálogo organizado por filial." /><div className="grade-gestao">{dados.servicos?.map((servico) => <article className="cartao-gestao" key={servico.idServico}><div><strong>{servico.nome}</strong><span>{servico.filial} · {servico.duracaoMinutos} min · R$ {Number(servico.valor).toFixed(2).replace('.', ',')}</span>{servico.descricao && <small>{servico.descricao}</small>}</div><AcoesGestao aoEditar={() => definirServicoEdicao(servico)} aoExcluir={() => excluirItem(`/servicos/${servico.idServico}`, `o serviço “${servico.nome}”`)} /></article>)}</div>{!dados.servicos?.length && <p className="estado-lista">Nenhum serviço cadastrado.</p>}</>; }

function Funcionarios({ dados, enviarFormulario, excluirItem, funcionarioEdicao, definirFuncionarioEdicao, idFilialProfissional, definirIdFilialProfissional }) { const editando = Boolean(funcionarioEdicao); const idFilial = idFilialProfissional || funcionarioEdicao?.idUnidade || ''; const servicosFilial = dados.servicos?.filter((servico) => Number(servico.idUnidade) === Number(idFilial)) ?? []; return <><p className="sobretitulo">Seu time</p><h1>{editando ? 'Atualize o profissional.' : 'Profissionais preparados para cuidar.'}</h1><form className="formulario-salao grade-formulario" key={funcionarioEdicao?.idFuncionario ?? 'novo'} onSubmit={(evento) => enviarFormulario(evento, editando ? `/funcionarios/${funcionarioEdicao.idFuncionario}` : '/funcionarios', editando ? 'PATCH' : 'POST')}><Campo nome="nome" rotulo="Nome do profissional" valor={funcionarioEdicao?.nome} /><label className="campo-formulario"><span>Filial</span><select name="idUnidade" onChange={(evento) => definirIdFilialProfissional(evento.target.value)} required value={idFilial}><option value="">Selecione</option>{dados.filiais?.map((filial) => <option key={filial.idUnidade} value={filial.idUnidade}>{filial.nome}</option>)}</select></label><label className="campo-formulario"><span>Serviços que realiza</span><select defaultValue={funcionarioEdicao?.idsServicos?.map(String)} disabled={!idFilial} key={`${funcionarioEdicao?.idFuncionario ?? 'novo'}-${idFilial}`} multiple name="idsServicos" required>{idFilial ? servicosFilial.map((servico) => <option key={servico.idServico} value={servico.idServico}>{servico.nome}</option>) : <option>Selecione uma filial primeiro</option>}</select></label><div className="acoes-formulario"><button className="botao-enviar">{editando ? 'Salvar profissional' : 'Adicionar profissional'} <span>→</span></button>{editando && <button className="botao-secundario" onClick={() => { definirFuncionarioEdicao(null); definirIdFilialProfissional(''); }} type="button">Cancelar edição</button>}</div></form><CabecalhoLista titulo="Profissionais cadastrados" descricao="Edite os serviços de cada profissional ou remova-o da agenda." /><div className="grade-gestao">{dados.funcionarios?.map((funcionario) => <article className="cartao-gestao" key={funcionario.idFuncionario}><div><strong>{funcionario.nome}</strong><span>{funcionario.filial}</span><small>{funcionario.servicos || 'Sem serviços vinculados'}</small></div><AcoesGestao aoEditar={() => { definirFuncionarioEdicao(funcionario); definirIdFilialProfissional(String(funcionario.idUnidade)); }} aoExcluir={() => excluirItem(`/funcionarios/${funcionario.idFuncionario}`, `o profissional “${funcionario.nome}”`)} /></article>)}</div>{!dados.funcionarios?.length && <p className="estado-lista">Nenhum profissional cadastrado.</p>}</>; }

function AvaliacoesSalao({ filiais = [], requisitar }) {
  const [idUnidade, definirIdUnidade] = useState('');
  const [pagina, definirPagina] = useState(1);
  const [dados, definirDados] = useState({ resumo: {}, avaliacoes: [], temMais: false });
  const [mensagem, definirMensagem] = useState('Carregando avaliações...');
  useEffect(() => {
    let ativo = true;
    definirMensagem('Carregando avaliações...');
    requisitar(`/avaliacoes?pagina=${pagina}${idUnidade ? `&idUnidade=${idUnidade}` : ''}`)
      .then((resultado) => { if (ativo) { definirDados(resultado); definirMensagem(''); } })
      .catch((erro) => { if (ativo) { definirMensagem(''); toastErro(erro.message); } });
    return () => { ativo = false; };
  }, [idUnidade, pagina, requisitar]);
  return <><p className="sobretitulo">Opiniões dos clientes</p><h1>Avaliações recebidas.</h1>
    <label className="campo-formulario"><span>Filial</span><select onChange={(evento) => { definirIdUnidade(evento.target.value); definirPagina(1); }} value={idUnidade}><option value="">Todas as filiais</option>{filiais.map((filial) => <option key={filial.idUnidade} value={filial.idUnidade}>{filial.nome}</option>)}</select></label>
    <div className="grade-indicadores"><Indicador titulo="Avaliações" valor={dados.resumo.quantidade ?? 0} /><Indicador titulo="Nota da filial" valor={dados.resumo.mediaSalao ? `${Number(dados.resumo.mediaSalao).toFixed(1)} ★` : '—'} /><Indicador titulo="Nota dos serviços" valor={dados.resumo.mediaServico ? `${Number(dados.resumo.mediaServico).toFixed(1)} ★` : '—'} /></div>
    {mensagem && <p className="estado-lista">{mensagem}</p>}
    {!mensagem && !dados.avaliacoes.length && <p className="estado-lista">Nenhuma avaliação recebida.</p>}
    <div className="lista-avaliacoes">{dados.avaliacoes.map((avaliacao) => <article className="cartao-avaliacao" key={avaliacao.idAvaliacao}><strong>{avaliacao.primeiroNome} · {avaliacao.filial}</strong><small>{formatarDataAssinatura(avaliacao.dataAvaliacao)} · {avaliacao.servico}</small><span>Filial {avaliacao.notaSalao} ★ · Serviço {avaliacao.notaServico} ★</span>{avaliacao.comentario && <p>{avaliacao.comentario}</p>}</article>)}</div>
    <div className="paginacao-avaliacoes"><button className="botao-secundario" disabled={pagina === 1} onClick={() => definirPagina(pagina - 1)} type="button">Anterior</button><span>Página {pagina}</span><button className="botao-secundario" disabled={!dados.temMais} onClick={() => definirPagina(pagina + 1)} type="button">Próxima</button></div>
  </>;
}

function Indicador({ titulo, valor, variante = '' }) { return <article className={variante ? `indicador indicador--${variante}` : 'indicador'}><span>{titulo}</span><strong>{valor}</strong></article>; }
function CabecalhoLista({ titulo, descricao }) { return <div className="cabecalho-lista"><h2>{titulo}</h2><p>{descricao}</p></div>; }
function AcoesGestao({ aoEditar, aoExcluir }) { return <div className="acoes-gestao"><button onClick={aoEditar} type="button">Alterar</button><button className="botao-perigo" onClick={aoExcluir} type="button">Excluir</button></div>; }
function Campo({ aoMudar, nome, rotulo, tipo = 'text', valor, passo, obrigatorio = true }) { return <label className="campo-formulario"><span>{rotulo}</span><input defaultValue={aoMudar ? undefined : valor ?? ''} name={nome} onChange={aoMudar} required={obrigatorio} step={passo} type={tipo} value={aoMudar ? valor ?? '' : undefined} /></label>; }
function SelectFilial({ filiais, valor }) { return <label className="campo-formulario"><span>Filial</span><select defaultValue={valor ?? ''} name="idUnidade" required><option value="">Selecione</option>{filiais?.map((filial) => <option key={filial.idUnidade} value={filial.idUnidade}>{filial.nome}</option>)}</select></label>; }
function SelectDuracao({ valor }) { return <label className="campo-formulario"><span>Duração</span><select defaultValue={valor ?? ''} name="duracaoMinutos" required><option disabled value="">Selecione</option>{[30, 45, 60, 90, 120].map((duracao) => <option key={duracao} value={duracao}>{duracao} minutos</option>)}</select></label>; }
function SelectCampo({ aoMudar, chave, opcoes, rotulo, valor }) { return <label className="campo-formulario"><span>{rotulo}</span><select onChange={aoMudar} value={valor}><option value="">Todos</option>{opcoes?.map((opcao) => <option key={opcao[chave]} value={opcao[chave]}>{opcao.nome}</option>)}</select></label>; }
function ListaSimples({ itens = [], campo, vazio }) { return <div className="lista-simples">{itens.length ? itens.map((item, indice) => <article key={item.idAgendamento ?? item.idClienteSalao ?? item.idUsuario ?? indice}><strong>{item[campo]}</strong><span>{item.servico ?? item.email ?? item.telefone ?? item.quantidade ?? ''}</span></article>) : <p className="estado-lista">{vazio}</p>}</div>; }
function formatarDataHora(valor) { return valor ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor)) : 'Data não informada'; }
function formatarDataAssinatura(valor) { return valor ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(valor)) : 'Data não informada'; }
