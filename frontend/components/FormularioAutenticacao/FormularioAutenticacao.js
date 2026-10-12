'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dataNascimentoMaiorDeIdade, dataParaIso, formatarCnpj, formatarCpf, formatarData, formatarTelefone } from '../../utils/formatadores';
import { requisitarApi } from '../../utils/api';
import { armazenarSessao } from '../../utils/respostaApi';
import { toastErro } from '../../utils/toast';
import CampoSenha from '../CampoSenha/CampoSenha';
import ModalCompletarPerfil from '../ModalCompletarPerfil/ModalCompletarPerfil';
import ModalConfirmacaoEmail from '../ModalConfirmacaoEmail/ModalConfirmacaoEmail';

const configuracoesPerfil = {
  cliente: { caminho: 'cliente', rotaApi: 'clientes', descricao: 'Encontre o profissional ideal para o seu próximo momento de cuidado.', icone: '♡', nome: 'cliente', tituloCadastro: 'Crie sua conta e cuide de você.', tituloLogin: 'Que bom ter você de volta.' },
  salao: { caminho: 'salao', rotaApi: 'saloes', descricao: 'Organize sua agenda e transforme cada atendimento em uma experiência especial.', icone: '✦', nome: 'salão', tituloCadastro: 'Vamos fazer seu salão crescer.', tituloLogin: 'Sua agenda começa aqui.' },
};

export default function FormularioAutenticacao({ modo, perfil }) {
  const roteador = useRouter();
  const configuracao = configuracoesPerfil[perfil];
  const estaNoCadastro = modo === 'cadastro';
  const [dadosFormulario, definirDadosFormulario] = useState({ nome: '', nomeSalao: '', telefoneResponsavel: '', email: '', senha: '', confirmacaoSenha: '', cpf: '', dataNascimento: '', tipoDocumento: 'CPF', documento: '' });
  const [enviando, definirEnviando] = useState(false);
  const [confirmarEmail, definirConfirmarEmail] = useState('');
  const [completarPerfil, definirCompletarPerfil] = useState(null);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    if (name === 'cpf') definirDadosFormulario((atual) => ({ ...atual, cpf: formatarCpf(value) }));
    else if (name === 'dataNascimento') definirDadosFormulario((atual) => ({ ...atual, dataNascimento: formatarData(value) }));
    else if (name === 'tipoDocumento') definirDadosFormulario((atual) => ({ ...atual, tipoDocumento: value, documento: '' }));
    else if (name === 'documento') definirDadosFormulario((atual) => ({ ...atual, documento: atual.tipoDocumento === 'CNPJ' ? formatarCnpj(value) : formatarCpf(value) }));
    else if (name === 'telefoneResponsavel') definirDadosFormulario((atual) => ({ ...atual, telefoneResponsavel: formatarTelefone(value) }));
    else definirDadosFormulario((atual) => ({ ...atual, [name]: value }));
  }

  function obterRetorno() {
    if (perfil !== 'cliente' || typeof window === 'undefined') return null;
    const retorno = new URLSearchParams(window.location.search).get('retorno') ?? localStorage.getItem('retornoAgendamento');
    return retorno?.startsWith('/') && !retorno.startsWith('//') ? retorno : null;
  }

  function caminhoAutenticacao(caminho) {
    const retorno = obterRetorno();
    return retorno ? `${caminho}?retorno=${encodeURIComponent(retorno)}` : caminho;
  }

  function irParaArea() { const retorno = obterRetorno(); if (retorno) localStorage.removeItem('retornoAgendamento'); roteador.push(retorno ?? (perfil === 'cliente' ? '/cliente/inicio' : '/salao/dashboard')); }

  async function enviarFormulario(evento) {
    evento.preventDefault();
    if (estaNoCadastro && dadosFormulario.senha !== dadosFormulario.confirmacaoSenha) { toastErro('As senhas precisam ser iguais.'); return; }
    const dataNascimento = dataParaIso(dadosFormulario.dataNascimento);
    if (estaNoCadastro && !dataNascimentoMaiorDeIdade(dataNascimento)) { toastErro('Você precisa ter pelo menos 18 anos para criar uma conta.'); return; }
    definirEnviando(true);
    const dadosEnvio = estaNoCadastro
      ? { [perfil === 'salao' ? 'nomeResponsavel' : 'nome']: dadosFormulario.nome, email: dadosFormulario.email, senha: dadosFormulario.senha, confirmacaoSenha: dadosFormulario.confirmacaoSenha, dataNascimento, ...(perfil === 'cliente' ? { cpf: dadosFormulario.cpf } : { nomeSalao: dadosFormulario.nomeSalao, telefoneResponsavel: dadosFormulario.telefoneResponsavel, tipoDocumento: dadosFormulario.tipoDocumento, documento: dadosFormulario.documento }) }
      : { email: dadosFormulario.email, senha: dadosFormulario.senha };
    try {
      const dadosResposta = await requisitarApi(`/api/${configuracao.rotaApi}/${estaNoCadastro ? 'cadastro' : 'login'}`, { dados: dadosEnvio, metodo: 'POST' });
      if (estaNoCadastro) { definirConfirmarEmail(dadosFormulario.email); return; }
      if (!dadosResposta.tokenAcesso || !dadosResposta.tokenAtualizacao) throw new Error('O login não retornou uma sessão válida.');
      armazenarSessao(dadosResposta.tokenAcesso, dadosResposta.tokenAtualizacao, perfil);
      if (dadosResposta.cadastroIncompleto || dadosResposta.salaoIncompleto) {
        definirCompletarPerfil({
          cadastroIncompleto: dadosResposta.cadastroIncompleto,
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

  return <main className="pagina-autenticacao"><div className="pagina-autenticacao__painel"><Link aria-label="Voltar para a página inicial" className="marca" href="/"><span aria-hidden="true" className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><div className="pagina-autenticacao__texto"><span aria-hidden="true" className="pagina-autenticacao__icone">{configuracao.icone}</span><p className="sobretitulo">Área do {configuracao.nome}</p><h1>{estaNoCadastro ? configuracao.tituloCadastro : configuracao.tituloLogin}</h1><p>{configuracao.descricao}</p></div></div><section className="pagina-autenticacao__formulario" aria-labelledby="titulo-formulario"><div className="formulario-cartao"><Link className="voltar-home" href="/">← Página inicial</Link><div className="formulario-cartao__cabecalho"><p className="sobretitulo">{estaNoCadastro ? 'Novo começo' : 'Acesse sua conta'}</p><h2 id="titulo-formulario">{estaNoCadastro ? `Cadastro de ${configuracao.nome}` : `Entrar como ${configuracao.nome}`}</h2><p>{estaNoCadastro ? 'Preencha seus dados para começar.' : 'Informe seus dados para continuar.'}</p></div><form onSubmit={enviarFormulario}>{estaNoCadastro && <DadosCadastrais aoMudar={alterarCampo} dados={dadosFormulario} perfil={perfil} />}<label className="campo-formulario"><span>E-mail</span><input autoComplete="email" name="email" onChange={alterarCampo} placeholder="voce@exemplo.com" required type="email" value={dadosFormulario.email} /></label><CampoSenha aoMudar={alterarCampo} autoComplete={estaNoCadastro ? 'new-password' : 'current-password'} id="senha" nome="senha" placeholder="No mínimo 6 caracteres" rotulo="Senha" valor={dadosFormulario.senha} />{estaNoCadastro && <CampoSenha aoMudar={alterarCampo} autoComplete="new-password" id="confirmacaoSenha" nome="confirmacaoSenha" placeholder="Repita sua senha" rotulo="Confirme sua senha" valor={dadosFormulario.confirmacaoSenha} />}<button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Aguarde...' : estaNoCadastro ? 'Criar minha conta' : 'Entrar na minha conta'} <span aria-hidden="true">→</span></button></form><p className="alternativa-autenticacao">{estaNoCadastro ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'} <Link href={caminhoAutenticacao(estaNoCadastro ? `/${configuracao.caminho}` : `/${configuracao.caminho}/cadastro`)}>{estaNoCadastro ? 'Fazer login' : 'Criar conta'}</Link></p>{!estaNoCadastro && <p className="alternativa-autenticacao"><Link href={`/${configuracao.caminho}/recuperar-senha`}>Esqueci minha senha</Link></p>}</div></section>{confirmarEmail && <ModalConfirmacaoEmail aoFechar={() => roteador.push(caminhoAutenticacao(`/${configuracao.caminho}`))} email={confirmarEmail} />}{completarPerfil && <ModalCompletarPerfil aoConcluir={irParaArea} cadastroIncompleto={completarPerfil.cadastroIncompleto} dadosCadastrais={completarPerfil.dadosCadastrais} nomeSalao={completarPerfil.nomeSalao} perfil={completarPerfil.perfil} salaoIncompleto={completarPerfil.salaoIncompleto} rotaApi={perfil === 'cliente' ? 'clientes' : 'salao'} tokenAcesso={completarPerfil.tokenAcesso} />}</main>;
}

function DadosCadastrais({ aoMudar, dados, perfil }) {
  return <><label className="campo-formulario"><span>{perfil === 'salao' ? 'Nome do responsável' : 'Seu nome'}</span><input autoComplete="name" name="nome" onChange={aoMudar} required value={dados.nome} /></label>{perfil === 'salao' && <><label className="campo-formulario"><span>Nome do salão</span><input name="nomeSalao" onChange={aoMudar} required value={dados.nomeSalao} /></label><label className="campo-formulario"><span>Telefone do responsável</span><input autoComplete="tel" inputMode="numeric" name="telefoneResponsavel" onChange={aoMudar} placeholder="(00) 00000-0000" required value={dados.telefoneResponsavel} /></label></>}<label className="campo-formulario"><span>Data de nascimento</span><input inputMode="numeric" maxLength="10" name="dataNascimento" onChange={aoMudar} placeholder="DD/MM/AAAA" required value={dados.dataNascimento} /></label>{perfil === 'cliente' ? <label className="campo-formulario"><span>CPF</span><input inputMode="numeric" name="cpf" onChange={aoMudar} placeholder="000.000.000-00" required value={dados.cpf} /></label> : <><label className="campo-formulario"><span>Usarei</span><select name="tipoDocumento" onChange={aoMudar} value={dados.tipoDocumento}><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option></select></label><label className="campo-formulario"><span>Número do {dados.tipoDocumento}</span><input inputMode="numeric" name="documento" onChange={aoMudar} placeholder={dados.tipoDocumento === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'} required value={dados.documento} /></label></>}</>;
}
