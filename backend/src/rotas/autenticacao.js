import { Router } from 'express';
import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { obterClienteAdministrativoSupabase, obterClienteSupabase } from '../configuracoes/supabase.js';
import { cnpjValido, cpfValido, dataNascimentoValida, somenteNumeros } from '../servicos/documentos.js';
import { prepararDocumento } from '../servicos/documentosProtegidos.js';
import { obterDadosCadastraisUsuario, sincronizarUsuario } from '../servicos/usuarios.js';
import { criarSlugSalaoUnico } from '../servicos/slugs.js';

const roteadorAutenticacao = Router();

const perfis = {
  cliente: 'CLIENTE',
  salao: 'ADMIN_SALAO',
};

async function removerCadastroLocal(idUsuario, perfil) {
  await bancoDeDados.transaction(async (transacao) => {
    if (perfil === perfis.salao) {
      await bancoDeDados.query('DELETE FROM tb_salao WHERE fk_usuario_administrador = :idUsuario', {
        replacements: { idUsuario }, transaction: transacao,
      });
    }
    await bancoDeDados.query('DELETE FROM tb_usuario WHERE id_usuario = :idUsuario', {
      replacements: { idUsuario }, transaction: transacao,
    });
  });
}

async function removerIdentidadeSupabase(clienteAdministrativo, idAutenticacaoExterna) {
  try {
    const { error } = await clienteAdministrativo.auth.admin.deleteUser(idAutenticacaoExterna);
    if (error) console.error('[Cadastro] Não foi possível remover a identidade de autenticação.', error.message);
  } catch (erro) {
    console.error('[Cadastro] Não foi possível remover a identidade de autenticação.', erro.message);
  }
}

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

  if (!dataNascimentoValida(dadosCadastro.dataNascimento)) {
    return 'Você precisa ter pelo menos 18 anos para criar uma conta.';
  }

  if (perfil === perfis.cliente && !cpfValido(dadosCadastro.cpf)) {
    return 'Informe um CPF válido.';
  }

  if (perfil === perfis.salao) {
    if (!dadosCadastro.nomeSalao?.trim()) return 'Informe o nome do salão.';
    if (somenteNumeros(dadosCadastro.telefoneResponsavel).length < 10 || somenteNumeros(dadosCadastro.telefoneResponsavel).length > 11) return 'Informe um telefone válido para o responsável.';
    const tipoDocumento = dadosCadastro.tipoDocumento;
    const documentoValido = tipoDocumento === 'CPF' ? cpfValido(dadosCadastro.documento) : tipoDocumento === 'CNPJ' && cnpjValido(dadosCadastro.documento);
    if (!documentoValido) return `Informe um ${tipoDocumento === 'CNPJ' ? 'CNPJ' : 'CPF'} válido.`;
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
  const cpf = perfil === perfis.cliente ? somenteNumeros(dadosCadastro.cpf) : null;
  const tipoDocumento = perfil === perfis.salao ? dadosCadastro.tipoDocumento : 'CPF';
  const documento = perfil === perfis.salao ? somenteNumeros(dadosCadastro.documento) : cpf;
  const telefone = perfil === perfis.salao ? somenteNumeros(dadosCadastro.telefoneResponsavel) : null;
  const nomeSalao = perfil === perfis.salao ? dadosCadastro.nomeSalao.trim() : null;

  let clienteAdministrativo;
  let idAutenticacaoExterna;
  let cadastroLocal;

  try {
    clienteAdministrativo = obterClienteAdministrativoSupabase();

    // Primeiro cria a identidade sem enviar e-mail. O link só é solicitado depois
    // que todos os registros locais forem gravados com sucesso.
    const { data: dadosAutenticacao, error: erroAutenticacao } = await clienteAdministrativo.auth.admin.createUser({
      email,
      password: dadosCadastro.senha,
      email_confirm: false,
      user_metadata: {
        nome,
        perfil,
        ...(perfil === perfis.salao ? { telefone, nomeSalao } : {}),
      },
    });

    if (erroAutenticacao) {
      return resposta.status(400).json({ mensagem: erroAutenticacao.message });
    }
    idAutenticacaoExterna = dadosAutenticacao.user?.id;
    if (!idAutenticacaoExterna) throw new Error('O provedor de autenticação não retornou o identificador da conta.');

    const tipoEfetivo = tipoDocumento ?? (cpf ? 'CPF' : null);
    const protegido = prepararDocumento(tipoEfetivo, documento);
    cadastroLocal = await bancoDeDados.transaction(async (transacao) => {
      const emailExistente = await bancoDeDados.query(
        'SELECT id_usuario FROM tb_usuario WHERE ds_email = :email LIMIT 1',
        { replacements: { email }, transaction: transacao, type: QueryTypes.SELECT },
      );
      if (emailExistente.length) {
        const erro = new Error('Este e-mail já está cadastrado.');
        erro.status = 409;
        throw erro;
      }

      if (protegido.documentoIndice) {
        const documentoExistente = await bancoDeDados.query(
          'SELECT id_usuario FROM tb_usuario WHERE ds_documento_indice = :documentoIndice LIMIT 1',
          { replacements: { documentoIndice: protegido.documentoIndice }, transaction: transacao, type: QueryTypes.SELECT },
        );
        if (documentoExistente.length) {
          const erro = new Error(`Este ${tipoEfetivo} já está cadastrado.`);
          erro.status = 409;
          throw erro;
        }
      }

      await bancoDeDados.query(
        `INSERT INTO tb_usuario (nm_usuario, ds_email, nu_telefone, dt_nascimento, tp_documento, ds_documento_cifrado, ds_documento_indice, tp_usuario, id_autenticacao_externa)
         VALUES (:nome, :email, :telefone, :dataNascimento, :tipoDocumento, :documentoCifrado, :documentoIndice, :perfil, :idAutenticacaoExterna)`,
        {
          replacements: {
            ...protegido,
            dataNascimento: dadosCadastro.dataNascimento,
            email,
            idAutenticacaoExterna,
            nome,
            perfil,
            telefone,
            tipoDocumento: tipoEfetivo,
          },
          transaction: transacao,
        },
      );

      const usuariosInseridos = await bancoDeDados.query(
        'SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa = :idAutenticacaoExterna LIMIT 1',
        { replacements: { idAutenticacaoExterna }, transaction: transacao, type: QueryTypes.SELECT },
      );
      if (!usuariosInseridos[0]) throw new Error('Não foi possível salvar o cadastro do responsável.');

      if (perfil === perfis.salao) {
        const slug = await criarSlugSalaoUnico(nomeSalao, { transaction: transacao });
        await bancoDeDados.query(
          'INSERT INTO tb_salao (fk_usuario_administrador, nm_salao, ds_slug) VALUES (:idUsuario, :nomeSalao, :slug)',
          { replacements: { idUsuario: usuariosInseridos[0].idUsuario, nomeSalao, slug }, transaction: transacao },
        );
      }

      return usuariosInseridos[0];
    });

    const clienteSupabase = obterClienteSupabase();
    const { error: erroEnvioConfirmacao } = await clienteSupabase.auth.resend({ type: 'signup', email });
    if (erroEnvioConfirmacao) {
      await removerCadastroLocal(cadastroLocal.idUsuario, perfil);
      cadastroLocal = null;
      await removerIdentidadeSupabase(clienteAdministrativo, idAutenticacaoExterna);
      idAutenticacaoExterna = null;
      return resposta.status(502).json({ mensagem: 'Não foi possível enviar o e-mail de confirmação. Nenhum cadastro foi concluído; tente novamente.' });
    }

    return resposta.status(201).json({
      mensagem: 'Conta criada. Enviamos um link para confirmar seu e-mail.',
      usuario: {
        id: idAutenticacaoExterna,
        email,
        nome,
        perfil,
      },
    });
  } catch (erro) {
    if (cadastroLocal) {
      try {
        await removerCadastroLocal(cadastroLocal.idUsuario, perfil);
      } catch (erroRemocaoLocal) {
        console.error('[Cadastro] Não foi possível remover os registros locais após falha no cadastro.', erroRemocaoLocal.message);
      }
    }
    if (idAutenticacaoExterna && clienteAdministrativo) await removerIdentidadeSupabase(clienteAdministrativo, idAutenticacaoExterna);
    return resposta.status(erro.status ?? 500).json({ mensagem: erro.message });
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

    const usuarioLocal = await sincronizarUsuario({
      email: dadosAutenticacao.user.email,
      idAutenticacaoExterna: dadosAutenticacao.user.id,
      nome: dadosAutenticacao.user.user_metadata.nome ?? dadosAutenticacao.user.email,
      perfil,
      telefone: dadosAutenticacao.user.user_metadata.telefone ?? null,
    });
    const dadosCadastrais = await obterDadosCadastraisUsuario(usuarioLocal.idUsuario);
    const cadastroIncompleto = perfil === perfis.cliente
      ? !dadosCadastrais?.cpf || !dadosCadastrais?.dataNascimento
      : !dadosCadastrais?.dataNascimento || !dadosCadastrais?.tipoDocumento || !dadosCadastrais?.documento || !dadosCadastrais?.telefone;
    let salaoIncompleto = false;
    if (perfil === perfis.salao) {
      const saloesLocais = await bancoDeDados.query(
        'SELECT id_salao FROM tb_salao WHERE fk_usuario_administrador=:idUsuario LIMIT 1',
        { replacements: { idUsuario: usuarioLocal.idUsuario }, type: QueryTypes.SELECT },
      );
      salaoIncompleto = saloesLocais.length === 0;
    }

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
      cadastroIncompleto,
      salaoIncompleto,
      nomeSalao: perfil === perfis.salao ? dadosAutenticacao.user.user_metadata?.nomeSalao ?? '' : null,
      dadosCadastrais,
    });
  } catch (erro) {
    return resposta.status(500).json({ mensagem: erro.message });
  }
}

async function renovarSessao(requisicao, resposta, perfil) {
  const tokenAtualizacao = requisicao.body?.tokenAtualizacao;
  if (!tokenAtualizacao) {
    return resposta.status(400).json({ mensagem: 'Informe o token de atualização para renovar a sessão.' });
  }

  try {
    const clienteSupabase = obterClienteSupabase();
    const { data: dadosAutenticacao, error: erroAutenticacao } = await clienteSupabase.auth.refreshSession({
      refresh_token: tokenAtualizacao,
    });

    if (erroAutenticacao || !dadosAutenticacao?.session?.access_token) {
      return resposta.status(401).json({ mensagem: 'A sessão expirou. Faça login novamente.' });
    }

    if (dadosAutenticacao.user?.user_metadata?.perfil !== perfil) {
      return resposta.status(403).json({ mensagem: 'A sessão não corresponde a esta área.' });
    }

    return resposta.status(200).json({
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
    const { error: erroAutenticacao } = await clienteSupabase.auth.admin.signOut(tokenAcesso, 'local');

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
roteadorAutenticacao.post('/clientes/refresh', (requisicao, resposta) => renovarSessao(requisicao, resposta, perfis.cliente));
roteadorAutenticacao.post('/clientes/logout', realizarLogout);
roteadorAutenticacao.post('/clientes/recuperar-senha', (requisicao, resposta) => solicitarRedefinicaoSenha(requisicao, resposta, perfis.cliente));
roteadorAutenticacao.post('/clientes/redefinir-senha', (requisicao, resposta) => redefinirSenha(requisicao, resposta, perfis.cliente));

roteadorAutenticacao.post('/saloes/cadastro', (requisicao, resposta) => criarConta(requisicao, resposta, perfis.salao));
roteadorAutenticacao.post('/saloes/login', (requisicao, resposta) => realizarLogin(requisicao, resposta, perfis.salao));
roteadorAutenticacao.post('/saloes/refresh', (requisicao, resposta) => renovarSessao(requisicao, resposta, perfis.salao));
roteadorAutenticacao.post('/saloes/logout', realizarLogout);
roteadorAutenticacao.post('/saloes/recuperar-senha', (requisicao, resposta) => solicitarRedefinicaoSenha(requisicao, resposta, perfis.salao));
roteadorAutenticacao.post('/saloes/redefinir-senha', (requisicao, resposta) => redefinirSenha(requisicao, resposta, perfis.salao));

export default roteadorAutenticacao;
