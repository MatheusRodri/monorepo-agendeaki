import { Router } from 'express';
import { obterClienteSupabase } from '../configuracoes/supabase.js';
import { sincronizarUsuario } from '../servicos/usuarios.js';

const roteadorAutenticacao = Router();

const perfis = {
  cliente: 'CLIENTE',
  salao: 'ADMIN_SALAO',
};

function obterNomeCadastro(dadosCadastro, perfil) {
  return perfil === perfis.salao ? dadosCadastro.nomeResponsavel : dadosCadastro.nome;
}

function validarDadosCadastro(dadosCadastro, perfil) {
  const nome = obterNomeCadastro(dadosCadastro, perfil)?.trim();
  const email = dadosCadastro.email?.trim();
  const senha = dadosCadastro.senha;
  const confirmacaoSenha = dadosCadastro.confirmacaoSenha;

  if (!nome || !email || !senha || !confirmacaoSenha) {
    return 'Preencha todos os campos obrigatórios.';
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return 'Informe um e-mail válido.';
  }

  if (senha.length < 6) {
    return 'A senha deve possuir pelo menos 6 caracteres.';
  }

  if (senha !== confirmacaoSenha) {
    return 'A confirmação de senha não corresponde à senha informada.';
  }

  return null;
}

function extrairTokenAcesso(requisicao) {
  const cabecalhoAutorizacao = requisicao.headers.authorization;

  if (!cabecalhoAutorizacao?.startsWith('Bearer ')) {
    return null;
  }

  return cabecalhoAutorizacao.slice(7);
}

function obterUrlRedefinicaoSenha(perfil) {
  const urlFrontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const caminho = perfil === perfis.cliente ? '/cliente/redefinir-senha' : '/salao/redefinir-senha';
  return `${urlFrontend}${caminho}`;
}

async function criarConta(requisicao, resposta, perfil) {
  const dadosCadastro = requisicao.body ?? {};
  const mensagemValidacao = validarDadosCadastro(dadosCadastro, perfil);

  if (mensagemValidacao) {
    return resposta.status(400).json({ mensagem: mensagemValidacao });
  }

  const nome = obterNomeCadastro(dadosCadastro, perfil).trim();
  const email = dadosCadastro.email.trim();

  try {
    const clienteSupabase = obterClienteSupabase();
    const { data: dadosAutenticacao, error: erroAutenticacao } = await clienteSupabase.auth.signUp({
      email,
      password: dadosCadastro.senha,
      options: {
        data: {
          nome,
          perfil,
        },
      },
    });

    if (erroAutenticacao) {
      return resposta.status(400).json({ mensagem: erroAutenticacao.message });
    }

    await sincronizarUsuario({
      email: dadosAutenticacao.user.email,
      idAutenticacaoExterna: dadosAutenticacao.user.id,
      nome,
      perfil,
    });

    return resposta.status(201).json({
      mensagem: 'Conta criada com sucesso. Faça login para continuar.',
      usuario: {
        id: dadosAutenticacao.user?.id,
        email: dadosAutenticacao.user?.email,
        nome,
        perfil,
      },
    });
  } catch (erro) {
    return resposta.status(500).json({ mensagem: erro.message });
  }
}

async function realizarLogin(requisicao, resposta, perfil) {
  const { email, senha } = requisicao.body ?? {};

  if (!email?.trim() || !senha) {
    return resposta.status(400).json({ mensagem: 'Informe e-mail e senha para continuar.' });
  }

  try {
    const clienteSupabase = obterClienteSupabase();
    const { data: dadosAutenticacao, error: erroAutenticacao } = await clienteSupabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (erroAutenticacao) {
      return resposta.status(401).json({ mensagem: 'E-mail ou senha inválidos.' });
    }

    if (!dadosAutenticacao.session?.access_token) {
      return resposta.status(401).json({ mensagem: 'Não foi possível iniciar uma sessão. Confirme seu e-mail e tente entrar novamente.' });
    }

    if (dadosAutenticacao.user?.user_metadata?.perfil !== perfil) {
      return resposta.status(403).json({ mensagem: 'Use a área de acesso correspondente ao seu perfil.' });
    }

    await sincronizarUsuario({
      email: dadosAutenticacao.user.email,
      idAutenticacaoExterna: dadosAutenticacao.user.id,
      nome: dadosAutenticacao.user.user_metadata.nome ?? dadosAutenticacao.user.email,
      perfil,
    });

    return resposta.status(200).json({
      mensagem: 'Login realizado com sucesso.',
      usuario: {
        id: dadosAutenticacao.user.id,
        email: dadosAutenticacao.user.email,
        nome: dadosAutenticacao.user.user_metadata.nome,
        perfil,
      },
      tokenAcesso: dadosAutenticacao.session.access_token,
      tokenAtualizacao: dadosAutenticacao.session.refresh_token,
    });
  } catch (erro) {
    return resposta.status(500).json({ mensagem: erro.message });
  }
}

async function realizarLogout(requisicao, resposta) {
  const tokenAcesso = extrairTokenAcesso(requisicao);

  if (!tokenAcesso) {
    return resposta.status(401).json({ mensagem: 'Informe o token de acesso para encerrar a sessão.' });
  }

  try {
    const clienteSupabase = obterClienteSupabase(tokenAcesso);
    const { error: erroAutenticacao } = await clienteSupabase.auth.signOut();

    if (erroAutenticacao) {
      return resposta.status(401).json({ mensagem: 'Não foi possível encerrar a sessão informada.' });
    }

    return resposta.status(204).send();
  } catch (erro) {
    return resposta.status(500).json({ mensagem: erro.message });
  }
}

async function solicitarRedefinicaoSenha(requisicao, resposta, perfil) {
  const email = requisicao.body?.email?.trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    resposta.status(400).json({ mensagem: 'Informe um e-mail válido.' });
    return;
  }

  try {
    const clienteSupabase = obterClienteSupabase();
    const { error: erroAutenticacao } = await clienteSupabase.auth.resetPasswordForEmail(email, {
      redirectTo: obterUrlRedefinicaoSenha(perfil),
    });
    if (erroAutenticacao) console.error('[Recuperação de senha] Falha no envio.', { mensagem: erroAutenticacao.message, perfil });
    resposta.status(200).json({ mensagem: 'Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha.' });
  } catch (erro) {
    console.error('[Recuperação de senha] Falha inesperada.', { mensagem: erro.message, perfil });
    resposta.status(500).json({ mensagem: 'Não foi possível solicitar a redefinição de senha agora. Tente novamente.' });
  }
}

async function redefinirSenha(requisicao, resposta, perfil) {
  const tokenAcesso = extrairTokenAcesso(requisicao);
  const senha = requisicao.body?.senha;
  const confirmacaoSenha = requisicao.body?.confirmacaoSenha;
  if (!tokenAcesso) { resposta.status(401).json({ mensagem: 'O link de redefinição é inválido ou expirou.' }); return; }
  if (!senha || senha.length < 6) { resposta.status(400).json({ mensagem: 'A nova senha deve possuir pelo menos 6 caracteres.' }); return; }
  if (senha !== confirmacaoSenha) { resposta.status(400).json({ mensagem: 'As senhas precisam ser iguais.' }); return; }

  try {
    const clienteSupabase = obterClienteSupabase(tokenAcesso);
    const { data: dadosUsuario, error: erroUsuario } = await clienteSupabase.auth.getUser(tokenAcesso);
    if (erroUsuario || dadosUsuario.user?.user_metadata?.perfil !== perfil) { resposta.status(401).json({ mensagem: 'O link de redefinição é inválido ou expirou.' }); return; }
    const respostaAtualizacao = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${tokenAcesso}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: senha }),
    });
    if (!respostaAtualizacao.ok) { resposta.status(400).json({ mensagem: 'Não foi possível atualizar a senha. Solicite um novo link e tente novamente.' }); return; }
    resposta.status(200).json({ mensagem: 'Senha redefinida com sucesso. Agora você já pode entrar.' });
  } catch (erro) {
    resposta.status(500).json({ mensagem: 'Não foi possível redefinir a senha agora. Tente novamente.' });
  }
}

roteadorAutenticacao.post('/clientes/cadastro', (requisicao, resposta) => criarConta(requisicao, resposta, perfis.cliente));
roteadorAutenticacao.post('/clientes/login', (requisicao, resposta) => realizarLogin(requisicao, resposta, perfis.cliente));
roteadorAutenticacao.post('/clientes/logout', realizarLogout);
roteadorAutenticacao.post('/clientes/recuperar-senha', (requisicao, resposta) => solicitarRedefinicaoSenha(requisicao, resposta, perfis.cliente));
roteadorAutenticacao.post('/clientes/redefinir-senha', (requisicao, resposta) => redefinirSenha(requisicao, resposta, perfis.cliente));

roteadorAutenticacao.post('/saloes/cadastro', (requisicao, resposta) => criarConta(requisicao, resposta, perfis.salao));
roteadorAutenticacao.post('/saloes/login', (requisicao, resposta) => realizarLogin(requisicao, resposta, perfis.salao));
roteadorAutenticacao.post('/saloes/logout', realizarLogout);
roteadorAutenticacao.post('/saloes/recuperar-senha', (requisicao, resposta) => solicitarRedefinicaoSenha(requisicao, resposta, perfis.salao));
roteadorAutenticacao.post('/saloes/redefinir-senha', (requisicao, resposta) => redefinirSenha(requisicao, resposta, perfis.salao));

export default roteadorAutenticacao;
