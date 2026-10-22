'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { requisitarApi } from '../../utils/api';
import { armazenarSessao, limparSessao, obterTokenAcesso } from '../../utils/respostaApi';

const secoes = [['dashboard', 'Visão geral'], ['clientes', 'Clientes'], ['saloes', 'Salões'], ['unidades', 'Filiais'], ['assinaturas', 'Assinaturas']];
const dinheiro = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0));
const data = (valor) => valor ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(valor)) : '—';

export default function PainelAdministrativo() {
  const [estado, definirEstado] = useState('verificando');
  const [perfil, definirPerfil] = useState(null);
  const [secao, definirSecao] = useState('dashboard');
  const [dashboard, definirDashboard] = useState(null);
  const [lista, definirLista] = useState(null);
  const [busca, definirBusca] = useState('');
  const [pagina, definirPagina] = useState(1);
  const [carregando, definirCarregando] = useState(false);
  const [erro, definirErro] = useState('');
  const [email, definirEmail] = useState('');
  const [senha, definirSenha] = useState('');
  const [enviando, definirEnviando] = useState(false);

  const carregarDashboard = useCallback(async () => {
    definirCarregando(true); definirErro('');
    try { definirDashboard(await requisitarApi('/api/admin/dashboard')); }
    catch (falha) { definirErro(falha.message); if ([401, 403].includes(falha.status)) { limparSessao('admin'); definirEstado('login'); } }
    finally { definirCarregando(false); }
  }, []);

  useEffect(() => {
    let ativo = true;
    async function restaurarSessao() {
      if (!obterTokenAcesso('admin')) { definirEstado('login'); return; }
      try {
        const resultado = await requisitarApi('/api/admin/perfil', { perfilUsuario: 'admin' });
        if (ativo) { definirPerfil(resultado.perfil); definirEstado('painel'); }
      } catch (falha) {
        if (!ativo) return;
        if ([401, 403].includes(falha.status)) limparSessao('admin');
        definirErro(falha.message); definirEstado('login');
      }
    }
    restaurarSessao();
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (estado !== 'painel') return undefined;
    if (secao === 'dashboard') { carregarDashboard(); return undefined; }
    let ativo = true;
    const parametros = new URLSearchParams({ pagina: String(pagina), limite: '20', busca });
    definirCarregando(true); definirErro('');
    requisitarApi(`/api/admin/${secao}?${parametros}`)
      .then((resultado) => { if (ativo) definirLista(resultado); })
      .catch((falha) => {
        if (!ativo) return;
        definirErro(falha.message);
        if ([401, 403].includes(falha.status)) { limparSessao('admin'); definirEstado('login'); }
      })
      .finally(() => { if (ativo) definirCarregando(false); });
    return () => { ativo = false; };
  }, [busca, carregarDashboard, estado, pagina, secao]);

  async function entrar(evento) {
    evento.preventDefault(); definirEnviando(true); definirErro('');
    try {
      const sessao = await requisitarApi('/api/admin/login', { dados: { email, senha }, metodo: 'POST', perfilUsuario: 'admin' });
      armazenarSessao(sessao.tokenAcesso, null, 'admin', false);
      definirPerfil(sessao.usuario); definirEstado('painel'); definirSenha('');
    } catch (falha) { definirErro(falha.message); }
    finally { definirEnviando(false); }
  }

  async function sair() {
    try { await requisitarApi('/api/admin/logout', { metodo: 'POST' }); } catch {}
    limparSessao('admin'); definirPerfil(null); definirEstado('login'); definirDashboard(null); definirSecao('dashboard');
  }

  if (estado === 'verificando') return <main className="admin-carregando" aria-live="polite">Verificando acesso administrativo…</main>;
  if (estado === 'login') return <main className="admin-login">
    <section className="admin-login__marca"><Link className="marca" href="/"><span className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><p className="sobretitulo">Área administrativa</p><h1>O AgendeAki em uma visão.</h1><p>Acesse os indicadores da plataforma, as contas cadastradas e as assinaturas.</p><span className="admin-login__orb" /></section>
    <section className="admin-login__formulario"><form className="admin-login__cartao" onSubmit={entrar}><p className="sobretitulo">Acesso restrito</p><h2>Entrar no painel</h2><p>Entre com a conta administrativa autorizada.</p><label htmlFor="admin-email">E-mail</label><input autoComplete="username" id="admin-email" onChange={(evento) => definirEmail(evento.target.value)} required type="email" value={email} /><label htmlFor="admin-senha">Senha</label><input autoComplete="current-password" id="admin-senha" onChange={(evento) => definirSenha(evento.target.value)} required type="password" value={senha} />{erro && <p className="admin-erro" role="alert">{erro}</p>}<button className="admin-botao admin-botao--principal" disabled={enviando} type="submit">{enviando ? 'Entrando…' : 'Entrar'}</button></form></section>
  </main>;

  const titulo = secoes.find(([chave]) => chave === secao)?.[1] ?? 'Visão geral';
  return <main className="admin-painel">
    <header className="admin-cabecalho"><Link className="marca" href="/"><span className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><div className="admin-cabecalho__usuario"><span>{perfil?.nome || perfil?.email || 'Administrador'}</span><span data-alternador-tema-destino /><button className="admin-botao admin-botao--leve" onClick={sair} type="button">Sair</button></div></header>
    <div className="admin-estrutura"><aside className="admin-menu" aria-label="Navegação administrativa"><p className="admin-menu__rotulo">PLATAFORMA</p>{secoes.map(([chave, nome]) => <button aria-current={secao === chave ? 'page' : undefined} className={secao === chave ? 'admin-menu__ativo' : ''} key={chave} onClick={() => { definirSecao(chave); definirPagina(1); definirBusca(''); definirLista(null); definirErro(''); }} type="button">{nome}</button>)}</aside>
      <section className="admin-conteudo"><div className="admin-titulo"><div><p className="sobretitulo">Painel da plataforma</p><h1>{secao === 'dashboard' ? 'Visão geral' : titulo}</h1></div>{secao !== 'dashboard' && <label className="admin-busca"><span>Buscar</span><input onChange={(evento) => { definirBusca(evento.target.value); definirPagina(1); }} placeholder={`Buscar ${titulo.toLowerCase()}…`} type="search" value={busca} /></label>}</div>
        {erro && <p className="admin-erro admin-erro--painel" role="alert">{erro}<button aria-label="Fechar aviso" onClick={() => definirErro('')} type="button">×</button></p>}
        {carregando && <p className="admin-carregando" aria-live="polite">Carregando dados…</p>}
        {!carregando && secao === 'dashboard' && dashboard && <Dashboard dados={dashboard} />}
        {!carregando && secao !== 'dashboard' && lista && <Lista secao={secao} dados={lista} pagina={pagina} definirPagina={definirPagina} />}
      </section>
    </div>
  </main>;
}

function Dashboard({ dados }) {
  const r = dados.resumo;
  const indicadores = [
    ['Clientes cadastrados', r.clientes.total, `${r.clientes.ativos} contas ativas`, 'ameixa', 'clientes', 'Quantidade de contas com perfil de cliente. A linha abaixo mostra quantas estão ativas.'],
    ['Salões cadastrados', r.saloes.total, `${r.saloes.ativos} salões ativos`, 'coral', 'saloes', 'Quantidade de salões cadastrados. A linha abaixo mostra quantos estão ativos.'],
    ['Assinaturas ativas', r.assinaturas.ativas, `${r.assinaturas.emTeste} em teste`, 'verde', 'assinaturas', 'Conta assinaturas autorizadas, inclusive as com cancelamento agendado até o fim do ciclo. Testes aparecem abaixo e não entram neste total.'],
    ['MRR estimado', dinheiro(r.mrrEstimado), 'Recorrência mensal normalizada', 'ameixa', 'mrr', 'Estimativa mensal das assinaturas autorizadas. Planos anuais são divididos por 12; assinaturas em teste não entram no cálculo.'],
    ['Receita confirmada', dinheiro(r.receitaConfirmada), `${r.faturasPagas} faturas pagas`, 'coral', 'receita', 'Soma bruta das faturas de assinatura pagas no Stripe. Não desconta taxas nem reembolsos.'],
    ['Pagamento pendente', r.assinaturas.pagamentoPendente, 'Assinaturas aguardando pagamento', 'neutro', 'pendencias', 'Quantidade de assinaturas com pagamento pendente. O número representa assinaturas, não o valor devido.'],
  ];
  return <><div className="admin-indicadores">{indicadores.map(([nome, valor, detalhe, tom, chave, descricao]) => <article className={`admin-indicador admin-indicador--${tom}`} key={nome}><div className="admin-indicador__cabecalho"><span>{nome}</span><AjudaIndicador chave={chave} descricao={descricao} /></div><strong>{valor}</strong><small>{detalhe}</small></article>)}</div>
    <div className="admin-graficos">
      <section className="admin-card admin-grafico--largo"><div className="admin-card__titulo"><div><h2>Novos cadastros</h2><p>Contas de clientes e salões por mês, nos últimos 12 meses.</p></div><div className="admin-legenda"><span><i />Clientes</span><span><i className="admin-legenda__saloes" />Salões</span></div></div><GraficoCadastros dados={dados.serieMensal ?? []} /></section>
      <section className="admin-card"><div className="admin-card__titulo"><div><h2>Receita de assinaturas</h2><p>Faturas pagas por mês, valores brutos.</p></div></div><GraficoReceita dados={dados.serieMensal ?? []} /></section>
      <section className="admin-card"><div className="admin-card__titulo"><div><h2>Novos salões</h2><p>Últimos estabelecimentos cadastrados.</p></div></div><div className="admin-lista-recente">{dados.ultimosSaloes?.length ? dados.ultimosSaloes.map((s) => <div className="admin-lista-recente__linha" key={s.idSalao}><span className="admin-avatar">{String(s.nome ?? 'S').charAt(0).toUpperCase()}</span><span><strong>{s.nome}</strong><small>{s.emailResponsavel}</small></span><small>{data(s.criadoEm)}</small></div>) : <p className="admin-vazio">Nenhum salão cadastrado.</p>}</div></section>
      <section className="admin-card admin-grafico--largo"><div className="admin-card__titulo"><div><h2>Faturas recebidas</h2><p>Últimas faturas de assinatura confirmadas no Stripe.</p></div></div>{dados.faturasRecentes?.length ? <div className="admin-tabela-wrap"><table className="admin-tabela"><thead><tr><th>Salão</th><th>Valor</th><th>Data de pagamento</th></tr></thead><tbody>{dados.faturasRecentes.map((f) => <tr key={f.id}><td>{f.salao}</td><td>{dinheiro(f.valor)}</td><td>{data(f.pagoEm)}</td></tr>)}</tbody></table></div> : <p className="admin-vazio">Nenhuma fatura paga registrada.</p>}</section>
    </div><p className="admin-nota">O MRR é uma estimativa baseada nas assinaturas ativas e não inclui planos em teste. A receita confirmada soma o valor bruto pago nas faturas Stripe importadas e recebidas após a implantação.</p></>;
}

function AjudaIndicador({ chave, descricao }) {
  const [aberto, definirAberto] = useState(false);
  const idDescricao = `admin-indicador-ajuda-${chave}`;
  return <span className={`admin-indicador__ajuda${aberto ? ' admin-indicador__ajuda--aberto' : ''}`} onMouseEnter={() => definirAberto(true)} onMouseLeave={() => definirAberto(false)}>
    <button aria-controls={idDescricao} aria-describedby={idDescricao} aria-expanded={aberto} aria-label={`Informações sobre ${chave}`} onBlur={() => definirAberto(false)} onClick={() => definirAberto((atual) => !atual)} onFocus={(evento) => { if (evento.currentTarget.matches(':focus-visible')) definirAberto(true); }} onKeyDown={(evento) => { if (evento.key === 'Escape') definirAberto(false); }} type="button">!</button>
    <span className="admin-indicador__descricao" id={idDescricao} role="tooltip">{descricao}</span>
  </span>;
}

function rotuloMes(mes) { return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${mes}-01T12:00:00`)).replace('.', ''); }

function GraficoCadastros({ dados }) {
  const maximo = Math.max(1, ...dados.flatMap((i) => [Number(i.clientes), Number(i.saloes)]));
  const largura = 840; const altura = 230; const topo = 12; const base = 184; const passo = largura / Math.max(1, dados.length);
  return <div className="admin-svg-wrap"><svg aria-hidden="true" className="admin-svg-grafico" viewBox={`0 0 ${largura} ${altura}`}><line className="admin-svg__eixo" x1="0" x2={largura} y1={base} y2={base} />{dados.map((i, n) => { const x = n * passo + passo * .23; const bw = Math.max(4, passo * .23); const hc = Number(i.clientes) / maximo * (base - topo); const hs = Number(i.saloes) / maximo * (base - topo); return <g key={i.mes}><rect className="admin-svg__barra-clientes" height={hc} rx="3" width={bw} x={x} y={base - hc} /><rect className="admin-svg__barra-saloes" height={hs} rx="3" width={bw} x={x + bw + 4} y={base - hs} /><text className="admin-svg__rotulo" textAnchor="middle" x={n * passo + passo / 2} y="213">{rotuloMes(i.mes)}</text></g>; })}</svg><table className="visualmente-oculto"><caption>Novos clientes e salões por mês nos últimos 12 meses</caption><thead><tr><th scope="col">Mês</th><th scope="col">Clientes</th><th scope="col">Salões</th></tr></thead><tbody>{dados.map((item) => <tr key={item.mes}><th scope="row">{rotuloMes(item.mes)} {item.mes.slice(0, 4)}</th><td>{item.clientes}</td><td>{item.saloes}</td></tr>)}</tbody></table></div>;
}

function GraficoReceita({ dados }) {
  const maximo = Math.max(1, ...dados.map((i) => Number(i.receita))); const largura = 520; const altura = 230; const topo = 14; const base = 184; const passo = largura / Math.max(1, dados.length);
  const pontos = dados.map((i, n) => `${n * passo + passo / 2},${base - Number(i.receita) / maximo * (base - topo)}`).join(' ');
  return <div className="admin-svg-wrap"><svg aria-hidden="true" className="admin-svg-grafico" viewBox={`0 0 ${largura} ${altura}`}><line className="admin-svg__eixo" x1="0" x2={largura} y1={base} y2={base} /><polyline className="admin-svg__linha-receita" points={pontos} />{dados.map((i, n) => { const x = n * passo + passo / 2; const y = base - Number(i.receita) / maximo * (base - topo); return <g key={i.mes}><circle className="admin-svg__ponto-receita" cx={x} cy={y} r="3.5" /><text className="admin-svg__rotulo" textAnchor="middle" x={x} y="213">{rotuloMes(i.mes)}</text></g>; })}</svg><table className="visualmente-oculto"><caption>Receita mensal confirmada de assinaturas</caption><thead><tr><th scope="col">Mês</th><th scope="col">Receita</th></tr></thead><tbody>{dados.map((item) => <tr key={item.mes}><th scope="row">{rotuloMes(item.mes)} {item.mes.slice(0, 4)}</th><td>{dinheiro(item.receita)}</td></tr>)}</tbody></table></div>;
}

function Lista({ secao, dados, pagina, definirPagina }) {
  const configs = {
    clientes: { vazio: 'Nenhum cliente encontrado.', colunas: [['nome', 'Cliente'], ['email', 'E-mail'], ['ativo', 'Situação', 'ativo'], ['criadoEm', 'Cadastro', 'data']] },
    saloes: { vazio: 'Nenhum salão encontrado.', colunas: [['nome', 'Salão'], ['responsavel', 'Responsável'], ['emailResponsavel', 'E-mail'], ['unidadesAtivas', 'Unidades'], ['ativo', 'Situação', 'ativo'], ['criadoEm', 'Cadastro', 'data']] },
    unidades: { vazio: 'Nenhuma filial encontrada.', colunas: [['nome', 'Filial'], ['salao', 'Salão'], ['endereco', 'Endereço'], ['cidade', 'Cidade'], ['categoria', 'Categoria', 'categoria'], ['ativo', 'Situação', 'ativo'], ['criadoEm', 'Cadastro', 'data']] },
    assinaturas: { vazio: 'Nenhuma assinatura encontrada.', colunas: [['salao', 'Salão'], ['emailResponsavel', 'E-mail'], ['periodicidade', 'Plano', 'periodicidade'], ['status', 'Situação', 'status'], ['valor', 'Valor', 'dinheiro'], ['atualizadoEm', 'Atualizada', 'data']] },
  };
  const config = configs[secao];
  return <><div className="admin-lista-info">{dados.total} registro(s)</div>{dados.itens?.length ? <div className="admin-tabela-wrap"><table className="admin-tabela"><thead><tr>{config.colunas.map(([, rotulo]) => <th key={rotulo}>{rotulo}</th>)}</tr></thead><tbody>{dados.itens.map((item) => <tr key={item.id}>{config.colunas.map(([campo, , tipo]) => <td key={campo}>{tipo === 'ativo' ? <span className={`admin-status ${item[campo] ? 'admin-status--ativo' : 'admin-status--inativo'}`}>{item[campo] ? 'Ativo' : 'Inativo'}</span> : tipo === 'status' ? <span className="admin-status">{String(item[campo] ?? '').replaceAll('_', ' ')}</span> : tipo === 'data' ? data(item[campo]) : tipo === 'dinheiro' ? dinheiro(item[campo]) : tipo === 'periodicidade' ? (item[campo] === 'ANUAL' ? 'Anual' : 'Mensal') : tipo === 'categoria' ? String(item[campo] ?? '').charAt(0) + String(item[campo] ?? '').slice(1).toLowerCase() : item[campo] ?? '—'}</td>)}</tr>)}</tbody></table></div> : <p className="admin-vazio">{config.vazio}</p>}<div className="admin-paginacao"><span>Página {dados.pagina} de {Math.max(1, dados.totalPaginas)}</span><div><button className="admin-botao admin-botao--leve" disabled={pagina <= 1} onClick={() => definirPagina((n) => n - 1)} type="button">Anterior</button><button className="admin-botao admin-botao--leve" disabled={pagina >= dados.totalPaginas} onClick={() => definirPagina((n) => n + 1)} type="button">Próxima</button></div></div></>;
}
