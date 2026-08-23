'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { armazenarSessao, obterUrlApi } from '../../utils/respostaApi';
import CampoSenha from '../CampoSenha/CampoSenha';

const configuracoesPerfil = {
  cliente: {
    caminho: 'cliente',
    rotaApi: 'clientes',
    descricao: 'Encontre o profissional ideal para o seu próximo momento de cuidado.',
    icone: '♡',
    nome: 'cliente',
    tituloCadastro: 'Crie sua conta e cuide de você.',
    tituloLogin: 'Que bom ter você de volta.',
  },
  salao: {
    caminho: 'salao',
    rotaApi: 'saloes',
    descricao: 'Organize sua agenda e transforme cada atendimento em uma experiência especial.',
    icone: '✦',
    nome: 'salão',
    tituloCadastro: 'Vamos fazer seu salão crescer.',
    tituloLogin: 'Sua agenda começa aqui.',
  },
};

export default function FormularioAutenticacao({ modo, perfil }) {
  const roteador = useRouter();
  const configuracao = configuracoesPerfil[perfil];
  const estaNoCadastro = modo === 'cadastro';
  const [dadosFormulario, definirDadosFormulario] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmacaoSenha: '',
  });
  const [mensagem, definirMensagem] = useState('');
  const [tipoMensagem, definirTipoMensagem] = useState('');
  const [enviando, definirEnviando] = useState(false);

  function alterarCampo(evento) {
    const { name, value } = evento.target;

    definirDadosFormulario((dadosAtuais) => ({ ...dadosAtuais, [name]: value }));
  }

  async function enviarFormulario(evento) {
    evento.preventDefault();
    definirMensagem('');

    if (estaNoCadastro && dadosFormulario.senha !== dadosFormulario.confirmacaoSenha) {
      definirTipoMensagem('erro');
      definirMensagem('As senhas precisam ser iguais.');
      return;
    }

    definirEnviando(true);

    const dadosEnvio = estaNoCadastro
      ? {
        [perfil === 'salao' ? 'nomeResponsavel' : 'nome']: dadosFormulario.nome,
        email: dadosFormulario.email,
        senha: dadosFormulario.senha,
        confirmacaoSenha: dadosFormulario.confirmacaoSenha,
      }
      : { email: dadosFormulario.email, senha: dadosFormulario.senha };

    try {
      const urlApi = obterUrlApi();
      const resposta = await fetch(`${urlApi}/api/${configuracao.rotaApi}/${estaNoCadastro ? 'cadastro' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosEnvio),
      });
      const tipoConteudo = resposta.headers.get('content-type');
      const dadosResposta = tipoConteudo?.includes('application/json')
        ? await resposta.json()
        : {};

      if (!resposta.ok) {
        throw new Error(dadosResposta.mensagem ?? 'Não foi possível concluir a solicitação. Verifique se a API está em execução.');
      }

      if (estaNoCadastro) {
        definirTipoMensagem('sucesso');
        definirMensagem('Conta criada! Você será direcionado para o login.');
        window.setTimeout(() => roteador.push(`/${configuracao.caminho}`), 1200);
        return;
      }

      if (!dadosResposta.tokenAcesso) {
        throw new Error('O login não retornou uma sessão válida. Confirme a configuração do Supabase.');
      }

      armazenarSessao(dadosResposta.tokenAcesso, perfil);
      roteador.push(perfil === 'cliente' ? '/cliente/inicio' : '/salao/dashboard');
    } catch (erro) {
      definirTipoMensagem('erro');
      definirMensagem(erro.message);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <main className="pagina-autenticacao">
      <div className="pagina-autenticacao__painel">
        <Link aria-label="Voltar para a página inicial" className="marca" href="/">
          <span aria-hidden="true" className="marca__simbolo">a</span>
          <span>agende<span>aki</span></span>
        </Link>
        <div className="pagina-autenticacao__texto">
          <span aria-hidden="true" className="pagina-autenticacao__icone">{configuracao.icone}</span>
          <p className="sobretitulo">Área do {configuracao.nome}</p>
          <h1>{estaNoCadastro ? configuracao.tituloCadastro : configuracao.tituloLogin}</h1>
          <p>{configuracao.descricao}</p>
        </div>
        <div aria-hidden="true" className="pagina-autenticacao__detalhe pagina-autenticacao__detalhe--um" />
        <div aria-hidden="true" className="pagina-autenticacao__detalhe pagina-autenticacao__detalhe--dois" />
      </div>

      <section className="pagina-autenticacao__formulario" aria-labelledby="titulo-formulario">
        <div className="formulario-cartao">
          <Link className="voltar-home" href="/">← Página inicial</Link>
          <div className="formulario-cartao__cabecalho">
            <p className="sobretitulo">{estaNoCadastro ? 'Novo começo' : 'Acesse sua conta'}</p>
            <h2 id="titulo-formulario">{estaNoCadastro ? `Cadastro de ${configuracao.nome}` : `Entrar como ${configuracao.nome}`}</h2>
            <p>{estaNoCadastro ? 'Preencha seus dados para começar.' : 'Informe seus dados para continuar.'}</p>
          </div>

          <form onSubmit={enviarFormulario}>
            {estaNoCadastro && (
              <label className="campo-formulario" htmlFor="nome">
                <span>{perfil === 'salao' ? 'Nome do responsável' : 'Seu nome'}</span>
                <input autoComplete="name" id="nome" name="nome" onChange={alterarCampo} placeholder="Como podemos te chamar?" required value={dadosFormulario.nome} />
              </label>
            )}
            <label className="campo-formulario" htmlFor="email">
              <span>E-mail</span>
              <input autoComplete="email" id="email" name="email" onChange={alterarCampo} placeholder="voce@exemplo.com" required type="email" value={dadosFormulario.email} />
            </label>
            <CampoSenha aoMudar={alterarCampo} autoComplete={estaNoCadastro ? 'new-password' : 'current-password'} id="senha" nome="senha" placeholder="No mínimo 6 caracteres" rotulo="Senha" valor={dadosFormulario.senha} />
            {estaNoCadastro && (
              <CampoSenha aoMudar={alterarCampo} autoComplete="new-password" id="confirmacaoSenha" nome="confirmacaoSenha" placeholder="Repita sua senha" rotulo="Confirme sua senha" valor={dadosFormulario.confirmacaoSenha} />
            )}

            {mensagem && <p className={`mensagem-formulario mensagem-formulario--${tipoMensagem}`} role="alert">{mensagem}</p>}

            <button className="botao-enviar" disabled={enviando} type="submit">
              {enviando ? 'Aguarde...' : estaNoCadastro ? 'Criar minha conta' : 'Entrar na minha conta'} <span aria-hidden="true">→</span>
            </button>
          </form>

          <p className="alternativa-autenticacao">
            {estaNoCadastro ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}{' '}
            <Link href={estaNoCadastro ? `/${configuracao.caminho}` : `/${configuracao.caminho}/cadastro`}>
              {estaNoCadastro ? 'Fazer login' : 'Criar conta'}
            </Link>
          </p>
          {!estaNoCadastro && <p className="alternativa-autenticacao"><Link href={`/${configuracao.caminho}/recuperar-senha`}>Esqueci minha senha</Link></p>}
        </div>
      </section>
    </main>
  );
}
