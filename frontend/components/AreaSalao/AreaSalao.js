'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import AlternadorTema from '../AlternadorTema/AlternadorTema';
import CampoSenha from '../CampoSenha/CampoSenha';
import FormularioDadosSalao from '../FormularioDadosSalao/FormularioDadosSalao';
import FormularioFilial from '../FormularioFilial/FormularioFilial';
import DisponibilidadeSalao from '../DisponibilidadeSalao/DisponibilidadeSalao';
import FormularioAgendamentoSalao from '../FormularioAgendamentoSalao/FormularioAgendamentoSalao';
import { dataParaExibicao, dataParaIso, formatarCnpj, formatarCpf, formatarData } from '../../utils/formatadores';
import { requisitarApi } from '../../utils/api';
import { limparSessao, obterTokenAcesso } from '../../utils/respostaApi';

const navegacao = [['dashboard', 'Visão geral', '/salao/dashboard'], ['salao', 'Meu salão', '/salao/meu-salao'], ['filiais', 'Filiais', '/salao/filiais'], ['servicos', 'Serviços', '/salao/servicos'], ['funcionarios', 'Profissionais', '/salao/funcionarios'], ['disponibilidade', 'Disponibilidade', '/salao/disponibilidade'], ['clientes', 'Clientes', '/salao/clientes'], ['agendamentos', 'Agenda', '/salao/agendamentos'], ['configuracoes', 'Configurações', '/salao/configuracoes']];
const filtrosIniciais = { dataInicio: '', dataFim: '', idUnidade: '', idServico: '', idFuncionario: '' };

export default function AreaSalao({ secao }) {
  const roteador = useRouter();
  const [dados, definirDados] = useState({});
  const [mensagem, definirMensagem] = useState('');
  const [tipoMensagem, definirTipoMensagem] = useState('sucesso');
  const [carregando, definirCarregando] = useState(true);
  const [filialEdicao, definirFilialEdicao] = useState(null);
  const [servicoEdicao, definirServicoEdicao] = useState(null);
  const [funcionarioEdicao, definirFuncionarioEdicao] = useState(null);
  const [idFilialProfissional, definirIdFilialProfissional] = useState('');
  const [tipoAgenda, definirTipoAgenda] = useState('futuros');
  const [filtrosDashboard, definirFiltrosDashboard] = useState(filtrosIniciais);
  const [assinante, definirAssinante] = useState(false);

  const requisitar = useCallback(async (caminho, opcoes = {}) => {
    const tokenAcesso = obterTokenAcesso();
    if (!tokenAcesso) { limparSessao(); roteador.push('/salao'); throw new Error('Sua sessão não foi encontrada. Faça login novamente.'); }
    try {
      return await requisitarApi(`/api/salao${caminho}`, {
        dados: opcoes.body ? JSON.parse(opcoes.body) : undefined,
        metodo: opcoes.method,
      });
    } catch (erro) {
      if (erro.status === 401) { limparSessao(); roteador.push('/salao'); throw new Error('Sua sessão expirou. Faça login novamente.'); }
      throw erro;
    }
  }, [roteador]);

  const carregarDados = useCallback(async () => {
    definirCarregando(true); definirMensagem('');
    try {
      if (secao === 'dashboard') {
        const parametros = new URLSearchParams(Object.entries(filtrosDashboard).filter(([, valor]) => valor));
        definirDados(await requisitar(`/indicadores?${parametros}`));
      }
      if (secao === 'assinatura') definirDados(await requisitar('/assinatura'));
      if (secao === 'salao') {
        const dadosPerfil = await requisitar('/perfil');
        try {
          const dadosSalao = await requisitar('/saloes/atual');
          definirDados(dadosSalao);
        } catch (erro) {
          if (erro.status !== 404) throw erro;
          definirDados({ emailConta: dadosPerfil.perfil.email, salao: null });
        }
      }
      if (secao === 'configuracoes') { const [dadosSalao, dadosPerfil] = await Promise.all([requisitar('/saloes/atual'), requisitar('/perfil')]); definirDados({ ...dadosSalao, perfil: dadosPerfil.perfil }); }
      if (secao === 'filiais') definirDados(await requisitar('/filiais'));
      if (secao === 'servicos') { const [filiais, servicos] = await Promise.all([requisitar('/filiais'), requisitar('/servicos')]); definirDados({ filiais: filiais.filiais, servicos: servicos.servicos }); }
      if (secao === 'funcionarios') { const [filiais, servicos, funcionarios] = await Promise.all([requisitar('/filiais'), requisitar('/servicos'), requisitar('/funcionarios')]); definirDados({ filiais: filiais.filiais, servicos: servicos.servicos, funcionarios: funcionarios.funcionarios }); }
      if (secao === 'disponibilidade') definirDados(await requisitar('/filiais'));
      if (secao === 'clientes') definirDados(await requisitar('/clientes'));
      if (secao === 'agendamentos') {
        const [agenda, clientes, filiais, servicos, funcionarios] = await Promise.all([
          requisitar(`/agendamentos?tipo=${tipoAgenda}`), requisitar('/clientes'), requisitar('/filiais'),
          requisitar('/servicos'), requisitar('/funcionarios'),
        ]);
        definirDados({ ...agenda, clientes: clientes.clientes, filiais: filiais.filiais, servicos: servicos.servicos, funcionarios: funcionarios.funcionarios });
      }
    } catch (erro) {
      if (secao === 'dashboard' && erro.status === 404) { roteador.replace('/salao/meu-salao'); return; }
      definirMensagem(erro.message); definirTipoMensagem('erro'); definirDados({});
    } finally { definirCarregando(false); }
  }, [filtrosDashboard, requisitar, roteador, secao, tipoAgenda]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  useEffect(() => {
    let ativo = true;
    requisitar('/assinatura')
      .then((resultado) => { if (ativo) definirAssinante(Boolean(resultado.assinatura?.temAcessoPremium)); })
      .catch(() => { if (ativo) definirAssinante(false); });
    return () => { ativo = false; };
  }, [requisitar]);

  async function enviarFormulario(evento, caminho, metodo = 'POST', dadosAdicionais = {}) {
    evento.preventDefault(); definirMensagem('');
    const formulario = new FormData(evento.currentTarget);
    const dadosEnvio = { ...Object.fromEntries(formulario.entries()), ...dadosAdicionais };
    if (caminho.includes('/funcionarios')) dadosEnvio.idsServicos = formulario.getAll('idsServicos').map(Number);
    try {
      const resultado = await requisitar(caminho, { method: metodo, body: JSON.stringify(dadosEnvio) });
      definirMensagem(resultado.mensagem); definirTipoMensagem('sucesso');
      definirFilialEdicao(null); definirServicoEdicao(null); definirFuncionarioEdicao(null); definirIdFilialProfissional('');
      carregarDados(); return resultado;
    } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); return null; }
  }

  async function excluirItem(caminho, descricao) {
    if (!window.confirm(`Deseja remover ${descricao}? O histórico de agendamentos será preservado.`)) return;
    try { const resultado = await requisitar(caminho, { method: 'DELETE' }); definirMensagem(resultado.mensagem); definirTipoMensagem('sucesso'); definirFilialEdicao(null); definirServicoEdicao(null); definirFuncionarioEdicao(null); carregarDados(); } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); }
  }

  async function excluirConta() {
    try {
      await requisitar('/conta', { method: 'DELETE' });
      limparSessao();
      roteador.replace('/');
      return true;
    } catch (erro) {
      definirMensagem(erro.message);
      definirTipoMensagem('erro');
      return false;
    }
  }

  async function buscarCep(valorCep) {
    const cep = String(valorCep ?? '').replace(/\D/g, ''); if (cep.length !== 8) return null;
    try { const endereco = await requisitar(`/enderecos/${cep}`); definirDados((dadosAtuais) => ({ ...dadosAtuais, enderecoCep: endereco })); return endereco; } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); return null; }
  }
  async function buscarCoordenadas(cep, numero) { try { return await requisitar(`/coordenadas?cep=${encodeURIComponent(cep)}&numero=${encodeURIComponent(numero)}`); } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); return null; } }
  async function aoSalvarAgendamento(mensagemSucesso) {
    try {
      const [agenda, clientes] = await Promise.all([requisitar(`/agendamentos?tipo=${tipoAgenda}`), requisitar('/clientes')]);
      definirDados((atuais) => ({ ...atuais, ...agenda, clientes: clientes.clientes }));
      definirMensagem(mensagemSucesso); definirTipoMensagem('sucesso');
    } catch (erro) { definirMensagem(erro.message); definirTipoMensagem('erro'); }
  }

  const enderecoCep = dados.enderecoCep ?? filialEdicao ?? {};
  return <main className="area-salao"><header className="cabecalho-area"><Link className="marca" href="/"><span className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><p className="titulo-area-salao">Painel do salão</p><div className="acoes-cabecalho-salao"><Link className={['botao-assinatura', secao === 'assinatura' && 'botao-assinatura--ativo', assinante && 'botao-assinatura--assinante'].filter(Boolean).join(' ')} href="/salao/assinatura">{assinante ? 'Assinante' : 'Assinatura'}</Link><AlternadorTema /></div></header><div className="estrutura-salao"><aside className="menu-salao">{navegacao.map(([chave, titulo, caminho]) => <Link className={secao === chave ? 'menu-salao__ativo' : ''} href={caminho} key={chave}>{titulo}</Link>)}</aside><section className="conteudo-salao">{mensagem && <p className={`mensagem-formulario mensagem-formulario--${tipoMensagem}`}>{mensagem}</p>}{carregando ? <p className="estado-lista">Carregando...</p> : <ConteudoSalao dados={dados} enderecoCep={enderecoCep} enviarFormulario={enviarFormulario} excluirConta={excluirConta} excluirItem={excluirItem} buscarCep={buscarCep} buscarCoordenadas={buscarCoordenadas} filialEdicao={filialEdicao} definirFilialEdicao={definirFilialEdicao} requisitar={requisitar} servicoEdicao={servicoEdicao} definirServicoEdicao={definirServicoEdicao} funcionarioEdicao={funcionarioEdicao} definirFuncionarioEdicao={definirFuncionarioEdicao} idFilialProfissional={idFilialProfissional} definirIdFilialProfissional={definirIdFilialProfissional} secao={secao} tipoAgenda={tipoAgenda} definirTipoAgenda={definirTipoAgenda} filtrosDashboard={filtrosDashboard} definirFiltrosDashboard={definirFiltrosDashboard} aoAtivarPremium={() => definirAssinante(true)} aoSalvarAgendamento={aoSalvarAgendamento} />}</section></div></main>;
}

function ConteudoSalao(propriedades) {
  const { dados, secao } = propriedades;
  if (secao === 'dashboard') return <Dashboard dados={dados} {...propriedades} />;
  if (secao === 'assinatura') return <Assinatura aoAtivarPremium={propriedades.aoAtivarPremium} dados={dados} requisitar={propriedades.requisitar} />;
  if (secao === 'salao') { const salao = dados.salao; return <><p className="sobretitulo">{salao ? 'Informações gerais' : 'Primeiro passo'}</p><h1>{salao ? 'Dados do seu salão.' : 'Vamos criar seu salão.'}</h1><FormularioDadosSalao emailConta={salao?.emailConta ?? dados.emailConta} salao={salao} salvar={propriedades.enviarFormulario} /></>; }
  if (secao === 'configuracoes') return <Configuracoes excluirConta={propriedades.excluirConta} perfil={dados.perfil} requisitar={propriedades.requisitar} salao={dados.salao} />;
  if (secao === 'filiais') return <Filiais dados={dados} {...propriedades} />;
  if (secao === 'servicos') return <Servicos dados={dados} {...propriedades} />;
  if (secao === 'funcionarios') return <Funcionarios dados={dados} {...propriedades} />;
  if (secao === 'disponibilidade') return <DisponibilidadeSalao filiais={dados.filiais} requisitar={propriedades.requisitar} />;
  if (secao === 'clientes') return <><p className="sobretitulo">Relacionamento</p><h1>Clientes que já passaram por aqui.</h1><ListaSimples itens={dados.clientes} campo="nome" vazio="Os clientes aparecerão após os primeiros agendamentos." /></>;
  return <Agenda dados={dados} {...propriedades} />;
}

function Configuracoes({ excluirConta, perfil, requisitar, salao }) {
  const [dadosPerfil, definirDadosPerfil] = useState({ nome: perfil?.nome ?? '', dataNascimento: dataParaExibicao(perfil?.dataNascimento), tipoDocumento: perfil?.tipoDocumento ?? 'CPF', documento: perfil?.tipoDocumento === 'CNPJ' ? formatarCnpj(perfil?.documento) : formatarCpf(perfil?.documento) });
  const [senhas, definirSenhas] = useState({ senha: '', confirmacaoSenha: '' });
  const [confirmacao, definirConfirmacao] = useState('');
  const [excluindo, definirExcluindo] = useState(false);
  const [mensagem, definirMensagem] = useState('');
  const podeExcluir = confirmacao === 'EXCLUIR MINHA CONTA';

  useEffect(() => { definirDadosPerfil({ nome: perfil?.nome ?? '', dataNascimento: dataParaExibicao(perfil?.dataNascimento), tipoDocumento: perfil?.tipoDocumento ?? 'CPF', documento: perfil?.tipoDocumento === 'CNPJ' ? formatarCnpj(perfil?.documento) : formatarCpf(perfil?.documento) }); }, [perfil]);

  async function salvarPerfil(evento) {
    evento.preventDefault();
    try { const resultado = await requisitar('/perfil', { method: 'PATCH', body: JSON.stringify({ ...dadosPerfil, dataNascimento: dataParaIso(dadosPerfil.dataNascimento) }) }); definirMensagem(resultado.mensagem); } catch (erro) { definirMensagem(erro.message); }
  }

  async function salvarSenha(evento) {
    evento.preventDefault();
    try { const resultado = await requisitar('/senha', { method: 'PATCH', body: JSON.stringify(senhas) }); definirMensagem(resultado.mensagem); definirSenhas({ senha: '', confirmacaoSenha: '' }); } catch (erro) { definirMensagem(erro.message); }
  }

  async function confirmarExclusao() {
    if (!podeExcluir || !window.confirm('Esta ação é irreversível. Deseja excluir a conta e todos os dados do salão?')) return;
    definirExcluindo(true); const excluida = await excluirConta(); if (!excluida) definirExcluindo(false);
  }

  return <><p className="sobretitulo">Configurações</p><h1>Sua conta.</h1>{mensagem && <p className="mensagem-formulario">{mensagem}</p>}<section className="secao-configuracoes"><h2>Informações da conta</h2><form className="grade-formulario" onSubmit={salvarPerfil}><label className="campo-formulario"><span>Nome do responsável</span><input onChange={(evento) => definirDadosPerfil({ ...dadosPerfil, nome: evento.target.value })} required value={dadosPerfil.nome} /></label><label className="campo-formulario"><span>Data de nascimento</span><input inputMode="numeric" maxLength="10" onChange={(evento) => definirDadosPerfil({ ...dadosPerfil, dataNascimento: formatarData(evento.target.value) })} placeholder="DD/MM/AAAA" required value={dadosPerfil.dataNascimento} /></label><label className="campo-formulario"><span>Tipo de documento</span><select onChange={(evento) => definirDadosPerfil({ ...dadosPerfil, tipoDocumento: evento.target.value, documento: '' })} value={dadosPerfil.tipoDocumento}><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option></select></label><label className="campo-formulario"><span>Número do {dadosPerfil.tipoDocumento}</span><input inputMode="numeric" onChange={(evento) => definirDadosPerfil({ ...dadosPerfil, documento: dadosPerfil.tipoDocumento === 'CNPJ' ? formatarCnpj(evento.target.value) : formatarCpf(evento.target.value) })} required value={dadosPerfil.documento} /></label><button className="botao-enviar">Salvar informações →</button></form></section><section className="secao-configuracoes"><h2>Alterar senha</h2><form className="grade-formulario" onSubmit={salvarSenha}><CampoSenha aoMudar={(evento) => definirSenhas({ ...senhas, senha: evento.target.value })} id="novaSenhaSalao" nome="novaSenhaSalao" rotulo="Nova senha" valor={senhas.senha} /><CampoSenha aoMudar={(evento) => definirSenhas({ ...senhas, confirmacaoSenha: evento.target.value })} id="confirmacaoSenhaSalao" nome="confirmacaoSenhaSalao" rotulo="Confirme a nova senha" valor={senhas.confirmacaoSenha} /><button className="botao-enviar">Alterar senha →</button></form></section><section className="zona-perigo"><div><strong>Excluir conta permanentemente</strong><p>Isso remove o salão, filiais, profissionais, serviços, horários, agendamentos, pagamentos e o acesso da conta. Não é possível desfazer.</p>{salao?.email && <small>Conta: {salao.email}</small>}</div><label className="campo-formulario"><span>Digite <b>EXCLUIR MINHA CONTA</b> para confirmar</span><input disabled={excluindo} onChange={(evento) => definirConfirmacao(evento.target.value)} value={confirmacao} /></label><button className="botao-perigo" disabled={!podeExcluir || excluindo} onClick={confirmarExclusao} type="button">{excluindo ? 'Excluindo conta...' : 'Excluir minha conta'}</button></section></>;
}

function Dashboard({ dados, filtrosDashboard, definirFiltrosDashboard }) {
  const resumo = dados.resumo ?? {};
  return <><p className="sobretitulo">Visão geral</p><h1>Seu salão em movimento.</h1><div className="filtros-dashboard"><Campo nome="dataInicio" rotulo="De" tipo="date" valor={filtrosDashboard.dataInicio} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, dataInicio: evento.target.value })} /><Campo nome="dataFim" rotulo="Até" tipo="date" valor={filtrosDashboard.dataFim} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, dataFim: evento.target.value })} /><SelectCampo rotulo="Filial" valor={filtrosDashboard.idUnidade} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, idUnidade: evento.target.value })} opcoes={dados.opcoesFiltros?.filiais} chave="idUnidade" /><SelectCampo rotulo="Serviço" valor={filtrosDashboard.idServico} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, idServico: evento.target.value })} opcoes={dados.opcoesFiltros?.servicos} chave="idServico" /><SelectCampo rotulo="Profissional" valor={filtrosDashboard.idFuncionario} aoMudar={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, idFuncionario: evento.target.value })} opcoes={dados.opcoesFiltros?.funcionarios} chave="idFuncionario" /><button className="botao-secundario" onClick={() => definirFiltrosDashboard(filtrosIniciais)} type="button">Limpar filtros</button></div><div className="grade-indicadores grade-indicadores--tres"><Indicador titulo="Agendamentos ativos" valor={resumo.quantidadeAgendamentosAtivos ?? 0} /><Indicador titulo="Agendamentos cancelados" valor={resumo.quantidadeAgendamentosCancelados ?? 0} variante="neutra" /><Indicador titulo="Faturamento previsto" valor={`R$ ${Number(resumo.faturamento ?? 0).toFixed(2).replace('.', ',')}`} /></div><section className="secao-painel"><h2>Serviços mais solicitados</h2><ListaSimples itens={dados.servicosMaisSolicitados} campo="servico" vazio="Ainda não há dados para estes filtros." /></section><section className="secao-painel"><h2>Próximos atendimentos</h2><ListaSimples itens={dados.proximosAtendimentos} campo="cliente" vazio="Nenhum atendimento próximo para estes filtros." /></section></>;
}

function Assinatura({ aoAtivarPremium, dados, requisitar }) {
  const [assinatura, definirAssinatura] = useState(dados.assinatura);
  const [mensagem, definirMensagem] = useState('');
  const [enviando, definirEnviando] = useState('');
  useEffect(() => { definirAssinatura(dados.assinatura); }, [dados.assinatura]);
  const oferta = dados.oferta ?? {};
  const premium = oferta.premium ?? { opcoes: [], recursos: [] };
  const recursosBasicos = oferta.basico?.recursos?.length ? oferta.basico.recursos : ['Dashboard atual', 'Agenda, clientes e gestão do salão'];
  const recursosPremium = premium.recursos?.length ? premium.recursos : [{ nome: 'Dashboard com gráficos' }, { nome: 'Aviso de novo agendamento via N8N' }];
  const opcoesPremium = premium.opcoes?.length ? premium.opcoes : [{ periodicidade: 'MENSAL', valor: 29.90 }, { periodicidade: 'ANUAL', valor: 299.00 }];
  const premiumAtivo = assinatura?.temAcessoPremium;
  const modoTeste = Boolean(dados.modoTeste);

  async function assinar(periodicidade) {
    definirEnviando(periodicidade); definirMensagem('');
    try {
      if (modoTeste) {
        const resultado = await requisitar('/assinatura/ativar', { method: 'POST', body: JSON.stringify({ periodicidade }) });
        definirAssinatura(resultado.assinatura);
        aoAtivarPremium?.();
        definirMensagem(resultado.mensagem);
        return;
      }
      const resultado = await requisitar('/assinatura/checkout', { method: 'POST', body: JSON.stringify({ periodicidade }) });
      window.location.assign(resultado.checkoutUrl);
    } catch (erro) { definirMensagem(erro.message); } finally { definirEnviando(''); }
  }

  async function cancelar() {
    if (!window.confirm('Deseja cancelar a renovação do Premium? O acesso permanece até o fim do período já pago.')) return;
    definirEnviando('cancelar'); definirMensagem('');
    try {
      const resultado = await requisitar('/assinatura/cancelar', { method: 'PATCH' });
      definirMensagem(resultado.mensagem); definirAssinatura(resultado.assinatura ?? { ...assinatura, status: 'CANCELAMENTO_AGENDADO' });
    } catch (erro) { definirMensagem(erro.message); } finally { definirEnviando(''); }
  }

  async function alterarPeriodicidade(periodicidade) {
    definirEnviando(periodicidade); definirMensagem('');
    try {
      const resultado = await requisitar('/assinatura/periodicidade', { method: 'PATCH', body: JSON.stringify({ periodicidade }) });
      definirMensagem(resultado.mensagem); definirAssinatura({ ...assinatura, periodicidadePendente: periodicidade });
    } catch (erro) { definirMensagem(erro.message); } finally { definirEnviando(''); }
  }

  async function atualizarStatus() {
    definirEnviando('atualizar'); definirMensagem('');
    try {
      const resultado = await requisitar('/assinatura');
      definirAssinatura(resultado.assinatura);
      if (resultado.assinatura?.temAcessoPremium) aoAtivarPremium?.();
      definirMensagem('Status da assinatura atualizado.');
    } catch (erro) { definirMensagem(erro.message); } finally { definirEnviando(''); }
  }

  async function cancelarCheckoutPendente() {
    if (!window.confirm('Deseja cancelar este checkout pendente? Depois você poderá iniciar outra contratação.')) return;
    definirEnviando('cancelar-pendente'); definirMensagem('');
    try {
      const resultado = await requisitar('/assinatura/cancelar', { method: 'PATCH' });
      definirAssinatura({ ...assinatura, status: 'CANCELADA', temAcessoPremium: false });
      definirMensagem(resultado.mensagem);
    } catch (erro) { definirMensagem(erro.message); } finally { definirEnviando(''); }
  }

  const assinaturaPendente = assinatura?.status === 'PENDENTE';
  const assinaturaComProblema = ['PAUSADA', 'PAGAMENTO_PENDENTE'].includes(assinatura?.status);

  return <>
    <p className="sobretitulo">Plano do salão</p>
    <h1>Escolha como crescer.</h1>
    <p className="descricao-assinatura">O Básico mantém sua operação organizada. Com o Premium, você terá recursos avançados assim que forem lançados.</p>
    {mensagem && <p className="mensagem-formulario">{mensagem}</p>}
    {assinaturaPendente && <section className="status-assinatura"><div><strong>Checkout em andamento</strong><p>Se você já concluiu o checkout, aguarde a confirmação do Stripe e atualize o status.</p></div><button className="botao-secundario" disabled={Boolean(enviando)} onClick={atualizarStatus} type="button">{enviando === 'atualizar' ? 'Atualizando...' : 'Atualizar status'}</button><button className="botao-secundario" disabled={Boolean(enviando)} onClick={cancelarCheckoutPendente} type="button">{enviando === 'cancelar-pendente' ? 'Cancelando...' : 'Cancelar checkout'}</button></section>}
    {assinaturaComProblema && <section className="status-assinatura"><div><strong>{assinatura.status === 'PAUSADA' ? 'Assinatura pausada' : 'Pagamento pendente'}</strong><p>Verifique a forma de pagamento da assinatura Stripe antes de tentar novamente.</p></div><button className="botao-secundario" disabled={Boolean(enviando)} onClick={atualizarStatus} type="button">{enviando === 'atualizar' ? 'Atualizando...' : 'Atualizar status'}</button></section>}
    {premiumAtivo && <section className="status-assinatura"><div><strong>Premium {assinatura.periodicidade === 'ANUAL' ? 'anual' : 'mensal'}{assinatura.status === 'EM_TESTE' ? ' em teste' : ' ativo'}</strong><p>{assinatura.status === 'CANCELAMENTO_AGENDADO' ? 'A renovação foi cancelada. Você mantém o Premium até o fim do ciclo vigente.' : assinatura.status === 'EM_TESTE' ? 'Seu teste grátis está ativo. A cobrança começa ao final do período de teste.' : assinatura.periodicidadePendente ? `A troca para o plano ${assinatura.periodicidadePendente.toLowerCase()} será feita na próxima renovação.` : 'Sua assinatura está em dia.'}</p>{assinatura.dataProximaCobranca && <small>{assinatura.status === 'CANCELAMENTO_AGENDADO' ? 'Acesso Premium até: ' : assinatura.status === 'EM_TESTE' ? 'Primeira cobrança prevista: ' : 'Próxima renovação: '}{formatarDataAssinatura(assinatura.dataProximaCobranca)}</small>}</div>{assinatura.status !== 'CANCELAMENTO_AGENDADO' && <button className="botao-secundario" disabled={enviando === 'cancelar'} onClick={cancelar} type="button">{enviando === 'cancelar' ? 'Cancelando...' : 'Cancelar renovação'}</button>}</section>}
    <div className="grade-planos">
      <article className="cartao-plano"><p className="sobretitulo">{oferta.basico?.nome ?? 'Básico'}</p><h2>Para organizar a rotina.</h2><strong className="preco-plano">Grátis</strong><ul>{recursosBasicos.map((recurso) => <li key={recurso}>✓ {recurso}</li>)}</ul><span className="plano-atual">{premiumAtivo ? 'Plano disponível' : 'Seu plano atual'}</span></article>
      <article className="cartao-plano cartao-plano--premium"><p className="sobretitulo">{premium.nome ?? 'Premium'}</p><h2>Para acompanhar cada resultado.</h2><p className="titulo-recursos-premium">O que estamos desenvolvendo</p><ul className="lista-recursos-premium">{recursosPremium.map((recurso) => <li key={recurso.nome}><div><span>{recurso.nome}</span><b aria-label="Recurso em desenvolvimento">*</b></div><small>Em desenvolvimento</small></li>)}</ul><p className="teste-plano">{premium.testeGratisDias ?? 7} dias grátis para testar</p><div className="opcoes-premium">{opcoesPremium.map((opcao) => { const selecionada = assinatura?.periodicidade === opcao.periodicidade || assinatura?.periodicidadePendente === opcao.periodicidade; return <section key={opcao.periodicidade}><div><strong>R$ {Number(opcao.valor).toFixed(2).replace('.', ',')}</strong><span>por {opcao.periodicidade === 'ANUAL' ? 'ano' : 'mês'}</span></div>{premiumAtivo ? <button className="botao-secundario" disabled={selecionada || Boolean(assinatura?.periodicidadePendente) || enviando === opcao.periodicidade} onClick={() => alterarPeriodicidade(opcao.periodicidade)} type="button">{selecionada ? 'Selecionado' : enviando === opcao.periodicidade ? 'Salvando...' : 'Escolher'}</button> : <button className="botao-enviar" disabled={Boolean(enviando)} onClick={() => assinar(opcao.periodicidade)} type="button">{enviando === opcao.periodicidade ? (modoTeste ? 'Ativando...' : 'Abrindo checkout...') : (modoTeste ? 'Ativar Premium para teste' : 'Assinar com Stripe')}</button>}</section>; })}</div></article>
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
  return <><p className="sobretitulo">Presença local</p><h1>{filialEdicao ? 'Atualize a filial.' : 'Cadastre uma nova filial.'}</h1><FormularioFilial buscarCep={buscarCep} buscarCoordenadas={buscarCoordenadas} endereco={enderecoCep} filial={filialEdicao} key={filialEdicao?.idUnidade ?? 'nova'} salvarFilial={enviarFormulario} /><CabecalhoLista titulo="Suas filiais" descricao="Selecione uma unidade para alterar os dados, copiar o link de agendamento ou removê-la da descoberta." /><div className="grade-gestao">{dados.filiais?.map((filial) => { const paginaAtiva = Number(filial.quantidadeOpcoesAgendamento) > 0; return <article className="cartao-gestao" key={filial.idUnidade}><div><strong>{filial.nome}</strong><span>{filial.categoria} · {filial.municipio}/{filial.estado}</span><small>{filial.rua}, {filial.numero} · {filial.telefone || 'Sem telefone'}</small><small>{paginaAtiva ? 'Página de agendamento disponível' : 'Página temporariamente indisponível'}</small></div><div className="acoes-gestao"><button disabled={!paginaAtiva} onClick={() => copiarLink(filial)} type="button">Copiar link</button><button disabled={!paginaAtiva} onClick={() => compartilharWhatsApp(filial)} type="button">WhatsApp</button><AcoesGestao aoEditar={() => definirFilialEdicao(filial)} aoExcluir={() => excluirItem(`/filiais/${filial.idUnidade}`, `a filial “${filial.nome}”`)} /></div></article>; })}</div>{!dados.filiais?.length && <p className="estado-lista">Nenhuma filial cadastrada.</p>}</>;
}

function Servicos({ dados, enviarFormulario, excluirItem, servicoEdicao, definirServicoEdicao }) { const editando = Boolean(servicoEdicao); return <><p className="sobretitulo">Seu catálogo</p><h1>{editando ? 'Atualize o serviço.' : 'Serviços que encantam.'}</h1><form className="formulario-salao grade-formulario" key={servicoEdicao?.idServico ?? 'novo'} onSubmit={(evento) => enviarFormulario(evento, editando ? `/servicos/${servicoEdicao.idServico}` : '/servicos', editando ? 'PATCH' : 'POST')}><SelectFilial filiais={dados.filiais} valor={servicoEdicao?.idUnidade} /><Campo nome="nome" rotulo="Nome do serviço" valor={servicoEdicao?.nome} /><Campo nome="valor" rotulo="Valor" tipo="number" passo="0.01" valor={servicoEdicao?.valor} /><SelectDuracao valor={servicoEdicao?.duracaoMinutos} /><Campo nome="descricao" rotulo="Descrição" valor={servicoEdicao?.descricao} obrigatorio={false} /><div className="acoes-formulario"><button className="botao-enviar">{editando ? 'Salvar serviço' : 'Adicionar serviço'} <span>→</span></button>{editando && <button className="botao-secundario" onClick={() => definirServicoEdicao(null)} type="button">Cancelar edição</button>}</div></form><CabecalhoLista titulo="Serviços cadastrados" descricao="Seu catálogo organizado por filial." /><div className="grade-gestao">{dados.servicos?.map((servico) => <article className="cartao-gestao" key={servico.idServico}><div><strong>{servico.nome}</strong><span>{servico.filial} · {servico.duracaoMinutos} min · R$ {Number(servico.valor).toFixed(2).replace('.', ',')}</span>{servico.descricao && <small>{servico.descricao}</small>}</div><AcoesGestao aoEditar={() => definirServicoEdicao(servico)} aoExcluir={() => excluirItem(`/servicos/${servico.idServico}`, `o serviço “${servico.nome}”`)} /></article>)}</div>{!dados.servicos?.length && <p className="estado-lista">Nenhum serviço cadastrado.</p>}</>; }

function Funcionarios({ dados, enviarFormulario, excluirItem, funcionarioEdicao, definirFuncionarioEdicao, idFilialProfissional, definirIdFilialProfissional }) { const editando = Boolean(funcionarioEdicao); const idFilial = idFilialProfissional || funcionarioEdicao?.idUnidade || ''; const servicosFilial = dados.servicos?.filter((servico) => Number(servico.idUnidade) === Number(idFilial)) ?? []; return <><p className="sobretitulo">Seu time</p><h1>{editando ? 'Atualize o profissional.' : 'Profissionais preparados para cuidar.'}</h1><form className="formulario-salao grade-formulario" key={funcionarioEdicao?.idFuncionario ?? 'novo'} onSubmit={(evento) => enviarFormulario(evento, editando ? `/funcionarios/${funcionarioEdicao.idFuncionario}` : '/funcionarios', editando ? 'PATCH' : 'POST')}><Campo nome="nome" rotulo="Nome do profissional" valor={funcionarioEdicao?.nome} /><label className="campo-formulario"><span>Filial</span><select name="idUnidade" onChange={(evento) => definirIdFilialProfissional(evento.target.value)} required value={idFilial}><option value="">Selecione</option>{dados.filiais?.map((filial) => <option key={filial.idUnidade} value={filial.idUnidade}>{filial.nome}</option>)}</select></label><label className="campo-formulario"><span>Serviços que realiza</span><select defaultValue={funcionarioEdicao?.idsServicos?.map(String)} disabled={!idFilial} key={`${funcionarioEdicao?.idFuncionario ?? 'novo'}-${idFilial}`} multiple name="idsServicos" required>{idFilial ? servicosFilial.map((servico) => <option key={servico.idServico} value={servico.idServico}>{servico.nome}</option>) : <option>Selecione uma filial primeiro</option>}</select></label><div className="acoes-formulario"><button className="botao-enviar">{editando ? 'Salvar profissional' : 'Adicionar profissional'} <span>→</span></button>{editando && <button className="botao-secundario" onClick={() => { definirFuncionarioEdicao(null); definirIdFilialProfissional(''); }} type="button">Cancelar edição</button>}</div></form><CabecalhoLista titulo="Profissionais cadastrados" descricao="Edite os serviços de cada profissional ou remova-o da agenda." /><div className="grade-gestao">{dados.funcionarios?.map((funcionario) => <article className="cartao-gestao" key={funcionario.idFuncionario}><div><strong>{funcionario.nome}</strong><span>{funcionario.filial}</span><small>{funcionario.servicos || 'Sem serviços vinculados'}</small></div><AcoesGestao aoEditar={() => { definirFuncionarioEdicao(funcionario); definirIdFilialProfissional(String(funcionario.idUnidade)); }} aoExcluir={() => excluirItem(`/funcionarios/${funcionario.idFuncionario}`, `o profissional “${funcionario.nome}”`)} /></article>)}</div>{!dados.funcionarios?.length && <p className="estado-lista">Nenhum profissional cadastrado.</p>}</>; }

function Agenda({ dados, tipoAgenda, definirTipoAgenda, requisitar, aoSalvarAgendamento }) {
  const [criando, definirCriando] = useState(false);
  return <>
    <p className="sobretitulo">Sua agenda</p><h1>Atendimentos do salão.</h1>
    <div className="cabecalho-agenda-salao">
      <div className="filtro-agendamentos"><button className={tipoAgenda === 'futuros' ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirTipoAgenda('futuros')} type="button">Próximos</button><button className={tipoAgenda === 'historico' ? 'filtro-agendamentos__ativo' : ''} onClick={() => definirTipoAgenda('historico')} type="button">Histórico</button></div>
      <button className="botao-enviar" onClick={() => definirCriando((valor) => !valor)} type="button">{criando ? 'Fechar formulário' : 'Novo agendamento'} <span>{criando ? '×' : '+'}</span></button>
    </div>
    {criando && <FormularioAgendamentoSalao clientes={dados.clientes ?? []} filiais={dados.filiais ?? []} funcionarios={dados.funcionarios ?? []} requisitar={requisitar} servicos={dados.servicos ?? []} aoCancelar={() => definirCriando(false)} aoSalvar={async (mensagem) => { definirCriando(false); await aoSalvarAgendamento(mensagem); }} />}
    <div className="lista-agendamentos-salao">{dados.agendamentos?.map((agendamento) => <article className="cartao-agendamento-salao" key={agendamento.idAgendamento}><div className="cartao-agendamento-salao__cabecalho"><div><strong>{agendamento.cliente}</strong><span>{formatarDataHora(agendamento.dataHoraInicio)} · {agendamento.filial}</span>{(agendamento.emailCliente || agendamento.telefoneCliente) && <small>{agendamento.telefoneCliente}{agendamento.telefoneCliente && agendamento.emailCliente ? ' · ' : ''}{agendamento.emailCliente}</small>}</div><span className={`selo-status selo-status--${String(agendamento.status).toLowerCase()}`}>{agendamento.status === 'AGENDADO' ? 'Confirmado' : agendamento.status === 'REALIZADO' ? 'Realizado' : 'Cancelado'}</span></div><dl><div><dt>Serviço</dt><dd>{agendamento.servico} · R$ {Number(agendamento.valor).toFixed(2).replace('.', ',')}</dd></div><div><dt>Profissional</dt><dd>{agendamento.funcionario}</dd></div><div><dt>Pagamento</dt><dd>{agendamento.pago ? 'Pago' : `Não pago (${agendamento.statusPagamento})`}</dd></div><div><dt>Observação</dt><dd>{agendamento.observacao || 'Nenhuma observação.'}</dd></div></dl></article>)}</div>{!dados.agendamentos?.length && <p className="estado-lista">Nenhum agendamento encontrado.</p>}
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
