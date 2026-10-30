'use client';

import { normalizarRetornoInterno } from '../../utils/retornoSeguro.mjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dataNascimentoMaiorDeIdade, dataParaIso, formatarCnpj, formatarData, formatarTelefone } from '../../utils/formatadores';
import { requisitarApi } from '../../utils/api';
import { armazenarSessao, limparSessao, obterTokenAcesso, obterTokenAtualizacao } from '../../utils/respostaApi';
import { toastErro } from '../../utils/toast';
import CampoSenha from '../CampoSenha/CampoSenha';
import ModalCompletarPerfil from '../ModalCompletarPerfil/ModalCompletarPerfil';
import ModalConfirmacaoEmail from '../ModalConfirmacaoEmail/ModalConfirmacaoEmail';
import ModalDocumentoLegal from '../ModalDocumentoLegal/ModalDocumentoLegal';

const configuracoesPerfil = {
  cliente: { caminho: 'cliente', rotaApi: 'clientes', descricao: 'Encontre o profissional ideal para o seu próximo momento de cuidado.', icone: '♡', nome: 'cliente', tituloCadastro: 'Crie sua conta e cuide de você.', tituloLogin: 'Que bom ter você de volta.' },
  salao: { caminho: 'salao', rotaApi: 'saloes', descricao: 'Organize sua agenda e transforme cada atendimento em uma experiência especial.', icone: '✦', nome: 'salão', tituloCadastro: 'Vamos fazer seu salão crescer.', tituloLogin: 'Sua agenda começa aqui.' },
};

export default function FormularioAutenticacao({ modo, perfil }) {
  const roteador = useRouter();
  const configuracao = configuracoesPerfil[perfil];
  const estaNoCadastro = modo === 'cadastro';
  const [dadosFormulario, definirDadosFormulario] = useState({ nome: '', nomeSalao: '', telefone: '', telefoneResponsavel: '', email: '', senha: '', confirmacaoSenha: '', dataNascimento: '', documento: '' });
  const [enviando, definirEnviando] = useState(false);
  const [manterConectado, definirManterConectado] = useState(true);
  const [verificandoSessao, definirVerificandoSessao] = useState(!estaNoCadastro);
  const [confirmarEmail, definirConfirmarEmail] = useState('');
  const [completarPerfil, definirCompletarPerfil] = useState(null);
  const [aceitouDocumentos, definirAceitouDocumentos] = useState(false);
  const [documentoAberto, definirDocumentoAberto] = useState(null);
  const [documentosLegais, definirDocumentosLegais] = useState(null);
  const [carregandoDocumentos, definirCarregandoDocumentos] = useState(false);
  const [erroDocumentos, definirErroDocumentos] = useState('');
  const [statusCnpj, definirStatusCnpj] = useState(null);
  const validacaoCnpjAtual = useRef(0);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    if (name === 'dataNascimento') definirDadosFormulario((atual) => ({ ...atual, dataNascimento: formatarData(value) }));
    else if (name === 'documento') {
      const documento = formatarCnpj(value);
      definirDadosFormulario((atual) => ({ ...atual, documento }));
      const idValidacao = ++validacaoCnpjAtual.current;
      definirStatusCnpj(null);
      if (perfil === 'salao' && estaNoCadastro && documento.replace(/[^0-9A-Z]/g, '').length === 14) {
        definirStatusCnpj({ documento, estado: 'verificando' });
        requisitarApi('/api/saloes/verificar-cnpj', { dados: { documento }, metodo: 'POST' })
          .then((resultado) => {
            if (validacaoCnpjAtual.current === idValidacao) {
              definirStatusCnpj({ documento, estado: !resultado.valido ? 'invalido' : resultado.disponivel ? 'disponivel' : 'duplicado', mensagem: resultado.mensagem });
            }
          })
          .catch(() => {
            if (validacaoCnpjAtual.current === idValidacao) definirStatusCnpj({ documento, estado: 'erro' });
          });
      }
    }
    else if (name === 'telefone' || name === 'telefoneResponsavel') definirDadosFormulario((atual) => ({ ...atual, [name]: formatarTelefone(value) }));
    else definirDadosFormulario((atual) => ({ ...atual, [name]: value }));
  }

  function obterRetorno() {
    if (perfil !== 'cliente' || typeof window === 'undefined') return null;
    const retorno = new URLSearchParams(window.location.search).get('retorno') ?? localStorage.getItem('retornoAgendamento');
    const seguro = normalizarRetornoInterno(retorno, window.location.origin);
    if (!seguro) localStorage.removeItem('retornoAgendamento');
    return seguro;
  }

  function caminhoAutenticacao(caminho) {
    const retorno = obterRetorno();
    return retorno ? `${caminho}?retorno=${encodeURIComponent(retorno)}` : caminho;
  }

  function irParaArea() { const retorno = obterRetorno(); if (retorno) localStorage.removeItem('retornoAgendamento'); roteador.push(retorno ?? (perfil === 'cliente' ? '/cliente/inicio' : '/salao/dashboard')); }

  async function abrirDocumento(tipo) {
    definirDocumentoAberto(tipo);
    if (documentosLegais || carregandoDocumentos) return;
    definirCarregandoDocumentos(true);
    definirErroDocumentos('');
    try {
      definirDocumentosLegais(await requisitarApi('/api/documentos-legais'));
    } catch (erro) {
      definirErroDocumentos(erro.message);
    } finally {
      definirCarregandoDocumentos(false);
    }
  }

  const fecharDocumento = useCallback(() => definirDocumentoAberto(null), []);

  useEffect(() => {
    if (estaNoCadastro) return undefined;
    let ativo = true;
    async function restaurarSessao() {
      if (!obterTokenAcesso(perfil) && !obterTokenAtualizacao(perfil)) {
        definirVerificandoSessao(false);
        return;
      }
      definirVerificandoSessao(true);
      try {
        const rotaPerfil = perfil === 'cliente' ? '/api/clientes/perfil' : '/api/salao/perfil';
        const dadosPerfil = await requisitarApi(rotaPerfil, { perfilUsuario: perfil });
        let salaoIncompleto = false;
        if (perfil === 'salao') {
          try {
            await requisitarApi('/api/salao/saloes/atual', { perfilUsuario: perfil });
          } catch (erro) {
            if (erro.status === 404) salaoIncompleto = true;
            else throw erro;
          }
        }
        if (!ativo) return;
        if (dadosPerfil.cadastroIncompleto || salaoIncompleto) {
          definirCompletarPerfil({
            cadastroIncompleto: Boolean(dadosPerfil.cadastroIncompleto),
            aceiteDocumentosPendente: dadosPerfil.aceiteDocumentosPendente,
            dadosCadastrais: dadosPerfil.perfil,
            nomeSalao: '',
            perfil: { nome: dadosPerfil.perfil?.nome, perfil: perfil === 'cliente' ? 'CLIENTE' : 'ADMIN_SALAO' },
            salaoIncompleto,
            tokenAcesso: obterTokenAcesso(perfil),
          });
          return;
        }
        roteador.replace(perfil === 'cliente' ? '/cliente/inicio' : '/salao/dashboard');
      } catch (erro) {
        if (erro.codigo === 'EXCLUSAO_PENDENTE') roteador.replace('/salao/configuracoes');
        else if (erro.status === 403) limparSessao(perfil);
      } finally {
        if (ativo) definirVerificandoSessao(false);
      }
    }
    restaurarSessao();
    return () => { ativo = false; };
  }, [estaNoCadastro, perfil, roteador]);

  async function enviarFormulario(evento) {
    evento.preventDefault();
    if (perfil === 'salao' && ['duplicado', 'invalido'].includes(statusCnpj?.estado) && statusCnpj.documento === dadosFormulario.documento) return;
    if (estaNoCadastro && dadosFormulario.senha !== dadosFormulario.confirmacaoSenha) { toastErro('As senhas precisam ser iguais.'); return; }
    const dataNascimento = dataParaIso(dadosFormulario.dataNascimento);
    if (estaNoCadastro && !dataNascimentoMaiorDeIdade(dataNascimento)) { toastErro('Você precisa ter pelo menos 18 anos para criar uma conta.'); return; }
    definirEnviando(true);
    const dadosEnvio = estaNoCadastro
      ? { [perfil === 'salao' ? 'nomeResponsavel' : 'nome']: dadosFormulario.nome, email: dadosFormulario.email, senha: dadosFormulario.senha, confirmacaoSenha: dadosFormulario.confirmacaoSenha, dataNascimento, aceitouDocumentos, ...(perfil === 'salao' ? { nomeSalao: dadosFormulario.nomeSalao, telefoneResponsavel: dadosFormulario.telefoneResponsavel, tipoDocumento: 'CNPJ', documento: dadosFormulario.documento } : { telefone: dadosFormulario.telefone }) }
      : { email: dadosFormulario.email, senha: dadosFormulario.senha };
    try {
      const dadosResposta = await requisitarApi(`/api/${configuracao.rotaApi}/${estaNoCadastro ? 'cadastro' : 'login'}`, { dados: dadosEnvio, metodo: 'POST' });
      if (estaNoCadastro) { definirConfirmarEmail(dadosFormulario.email); return; }
      if (!dadosResposta.tokenAcesso || !dadosResposta.tokenAtualizacao) throw new Error('O login não retornou uma sessão válida.');
      armazenarSessao(dadosResposta.tokenAcesso, dadosResposta.tokenAtualizacao, perfil, manterConectado, dadosResposta.usuario.id);
      if (dadosResposta.exclusaoPendente) { roteador.replace('/salao/configuracoes'); return; }
      if (dadosResposta.cadastroIncompleto || dadosResposta.salaoIncompleto) {
        definirCompletarPerfil({
          cadastroIncompleto: dadosResposta.cadastroIncompleto,
          aceiteDocumentosPendente: dadosResposta.aceiteDocumentosPendente,
          dadosCadastrais: dadosResposta.dadosCadastrais,
          nomeSalao: dadosResposta.nomeSalao,
          perfil: dadosResposta.usuario,
          salaoIncompleto: dadosResposta.salaoIncompleto,
          tokenAcesso: dadosResposta.tokenAcesso,
        });
        return;
      }
      irParaArea();
    } catch (erro) { toastErro(erro.message); } finally { definirEnviando(false); }
  }

  return <main className="pagina-autenticacao"><div className="pagina-autenticacao__painel"><Link className="marca" href="/"><span aria-hidden="true" className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><div className="pagina-autenticacao__texto"><span aria-hidden="true" className="pagina-autenticacao__icone">{configuracao.icone}</span><p className="sobretitulo">Área do {configuracao.nome}</p><h1>{estaNoCadastro ? configuracao.tituloCadastro : configuracao.tituloLogin}</h1><p>{configuracao.descricao}</p></div></div><section className="pagina-autenticacao__formulario" aria-labelledby="titulo-formulario"><div className="formulario-cartao"><Link className="voltar-home" href="/">← Página inicial</Link><div className="formulario-cartao__cabecalho"><p className="sobretitulo">{estaNoCadastro ? 'Novo começo' : 'Acesse sua conta'}</p><h2 id="titulo-formulario">{estaNoCadastro ? `Cadastro de ${configuracao.nome}` : `Entrar como ${configuracao.nome}`}</h2><p>{estaNoCadastro ? 'Preencha seus dados para começar.' : verificandoSessao ? 'Verificando sua sessão salva...' : 'Informe seus dados para continuar.'}</p></div>{!verificandoSessao && <form onSubmit={enviarFormulario}>{estaNoCadastro && <DadosCadastrais aoMudar={alterarCampo} dados={dadosFormulario} perfil={perfil} statusCnpj={statusCnpj} />}<label className="campo-formulario"><span>E-mail</span><input autoComplete="email" name="email" onChange={alterarCampo} placeholder="voce@exemplo.com" required type="email" value={dadosFormulario.email} /></label><CampoSenha aoMudar={alterarCampo} autoComplete={estaNoCadastro ? 'new-password' : 'current-password'} id="senha" nome="senha" placeholder="No mínimo 6 caracteres" rotulo="Senha" valor={dadosFormulario.senha} />{estaNoCadastro && <CampoSenha aoMudar={alterarCampo} autoComplete="new-password" id="confirmacaoSenha" nome="confirmacaoSenha" placeholder="Repita sua senha" rotulo="Confirme sua senha" valor={dadosFormulario.confirmacaoSenha} />} {estaNoCadastro && <label className="aceite-documentos"><input checked={aceitouDocumentos} onChange={(evento) => definirAceitouDocumentos(evento.target.checked)} required type="checkbox" /><span>Li e aceito os <button onClick={() => abrirDocumento('termosDeUso')} type="button">Termos de Uso</button> e a <button onClick={() => abrirDocumento('politicaPrivacidade')} type="button">Política de Privacidade</button>.</span></label>}{!estaNoCadastro && <label className="manter-conectado"><input checked={manterConectado} onChange={(evento) => definirManterConectado(evento.target.checked)} type="checkbox" /><span>Manter conectado neste dispositivo</span></label>}<button className="botao-enviar" disabled={enviando || ['verificando', 'duplicado', 'invalido'].includes(statusCnpj?.estado)} type="submit">{enviando ? 'Aguarde...' : estaNoCadastro ? 'Criar minha conta' : 'Entrar na minha conta'} <span aria-hidden="true">→</span></button></form>}<p className="alternativa-autenticacao">{estaNoCadastro ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'} <Link href={caminhoAutenticacao(estaNoCadastro ? `/${configuracao.caminho}` : `/${configuracao.caminho}/cadastro`)}>{estaNoCadastro ? 'Fazer login' : 'Criar conta'}</Link></p>{!estaNoCadastro && <p className="alternativa-autenticacao"><Link href={`/${configuracao.caminho}/recuperar-senha`}>Esqueci minha senha</Link></p>}</div></section>{documentoAberto && <ModalDocumentoLegal aoFechar={fecharDocumento} carregando={carregandoDocumentos} documento={documentosLegais?.[documentoAberto]} erro={erroDocumentos} onRetry={() => abrirDocumento(documentoAberto)} tipo={documentoAberto} />}{confirmarEmail && <ModalConfirmacaoEmail aoFechar={() => roteador.push(caminhoAutenticacao(`/${configuracao.caminho}`))} email={confirmarEmail} />}{completarPerfil && <ModalCompletarPerfil aoConcluir={irParaArea} aceiteDocumentosPendente={completarPerfil.aceiteDocumentosPendente} cadastroIncompleto={completarPerfil.cadastroIncompleto} dadosCadastrais={completarPerfil.dadosCadastrais} nomeSalao={completarPerfil.nomeSalao} perfil={completarPerfil.perfil} salaoIncompleto={completarPerfil.salaoIncompleto} rotaApi={perfil === 'cliente' ? 'clientes' : 'salao'} tokenAcesso={completarPerfil.tokenAcesso} />}</main>;
}

function DadosCadastrais({ aoMudar, dados, perfil, statusCnpj }) {
  const documentoValidado = statusCnpj?.documento === dados.documento ? statusCnpj : null;
  return <>
    <label className="campo-formulario"><span>{perfil === 'salao' ? 'Nome do responsável' : 'Seu nome'}</span><input autoComplete="name" name="nome" onChange={aoMudar} placeholder={perfil === 'salao' ? 'Ex.: Maria da Silva' : 'Ex.: João da Silva'} required value={dados.nome} /></label>
    {perfil === 'salao' && <>
      <label className="campo-formulario"><span>Nome do salão</span><input name="nomeSalao" onChange={aoMudar} placeholder="Ex.: Studio Bella" required value={dados.nomeSalao} /></label>
      <label className="campo-formulario"><span>Telefone do responsável</span><input autoComplete="tel" inputMode="numeric" name="telefoneResponsavel" onChange={aoMudar} placeholder="(00) 00000-0000" required value={dados.telefoneResponsavel} /></label>
    </>}
    {perfil === 'cliente' && <label className="campo-formulario"><span>Telefone</span><input autoComplete="tel" inputMode="numeric" name="telefone" onChange={aoMudar} placeholder="(00) 00000-0000" required value={dados.telefone} /></label>}
    <label className="campo-formulario"><span>Data de nascimento</span><input inputMode="numeric" maxLength="10" name="dataNascimento" onChange={aoMudar} placeholder="DD/MM/AAAA" required value={dados.dataNascimento} /></label>
    {perfil === 'salao' && <label className="campo-formulario"><span>CNPJ da empresa</span><input aria-invalid={['duplicado', 'invalido'].includes(documentoValidado?.estado)} autoComplete="organization" maxLength="18" minLength="18" name="documento" onChange={aoMudar} placeholder="AA.AAA.AAA/AAAA-00" required value={dados.documento} />{documentoValidado?.estado && <small aria-live="polite" className={`validacao-cnpj validacao-cnpj--${documentoValidado.estado}`}>{documentoValidado.estado === 'verificando' ? 'Verificando CNPJ…' : documentoValidado.estado === 'disponivel' ? 'CNPJ disponível.' : documentoValidado.estado === 'duplicado' ? documentoValidado.mensagem ?? 'Este CNPJ já está cadastrado.' : documentoValidado.estado === 'invalido' ? 'Informe um CNPJ válido.' : 'Não foi possível verificar o CNPJ agora. Ele será validado ao enviar o cadastro.'}</small>}</label>}
  </>;
}
