'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CampoSenha from '../CampoSenha/CampoSenha';
import { lerRespostaApi, obterUrlApi } from '../../utils/respostaApi';
import { PaginaAcesso } from '../FormularioRecuperacaoSenha/FormularioRecuperacaoSenha';

const configuracoes = {
  cliente: { caminho: 'cliente', rotaApi: 'clientes' },
  salao: { caminho: 'salao', rotaApi: 'saloes' },
};

export default function FormularioRedefinicaoSenha({ perfil }) {
  const roteador = useRouter();
  const configuracao = configuracoes[perfil];
  const [tokenAcesso, definirTokenAcesso] = useState('');
  const [dadosFormulario, definirDadosFormulario] = useState({ confirmacaoSenha: '', senha: '' });
  const [mensagem, definirMensagem] = useState('');
  const [tipoMensagem, definirTipoMensagem] = useState('');
  const [enviando, definirEnviando] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('access_token');
    if (token) definirTokenAcesso(token);
    else { definirTipoMensagem('erro'); definirMensagem('O link de redefinição é inválido ou expirou. Solicite um novo link.'); }
  }, []);

  function alterarCampo(evento) {
    definirDadosFormulario((dadosAtuais) => ({ ...dadosAtuais, [evento.target.name]: evento.target.value }));
  }

  async function enviarFormulario(evento) {
    evento.preventDefault();
    if (!tokenAcesso) return;
    if (dadosFormulario.senha !== dadosFormulario.confirmacaoSenha) { definirTipoMensagem('erro'); definirMensagem('As senhas precisam ser iguais.'); return; }
    definirEnviando(true); definirMensagem('');
    try {
      const resposta = await fetch(`${obterUrlApi()}/api/${configuracao.rotaApi}/redefinir-senha`, { method: 'POST', headers: { Authorization: `Bearer ${tokenAcesso}`, 'Content-Type': 'application/json' }, body: JSON.stringify(dadosFormulario) });
      const { dados, mensagem: mensagemResposta } = await lerRespostaApi(resposta);
      if (!resposta.ok) throw new Error(dados.mensagem ?? mensagemResposta);
      definirTipoMensagem('sucesso'); definirMensagem(dados.mensagem);
      window.setTimeout(() => roteador.replace(`/${configuracao.caminho}`), 1400);
    } catch (erro) {
      definirTipoMensagem('erro'); definirMensagem(erro.message);
    } finally { definirEnviando(false); }
  }

  return <PaginaAcesso caminho={configuracao.caminho} descricao="Escolha uma senha nova, com pelo menos seis caracteres, para acessar a sua conta novamente." titulo="Defina uma nova senha."><form onSubmit={enviarFormulario}><CampoSenha aoMudar={alterarCampo} autoComplete="new-password" id="senha" nome="senha" placeholder="No mínimo 6 caracteres" rotulo="Nova senha" valor={dadosFormulario.senha} /><CampoSenha aoMudar={alterarCampo} autoComplete="new-password" id="confirmacaoSenha" nome="confirmacaoSenha" placeholder="Repita a nova senha" rotulo="Confirme a nova senha" valor={dadosFormulario.confirmacaoSenha} />{mensagem && <p className={`mensagem-formulario mensagem-formulario--${tipoMensagem}`} role="alert">{mensagem}</p>}<button className="botao-enviar" disabled={!tokenAcesso || enviando} type="submit">{enviando ? 'Salvando...' : 'Salvar nova senha'} <span aria-hidden="true">→</span></button></form><p className="alternativa-autenticacao"><Link href={`/${configuracao.caminho}/recuperar-senha`}>Solicitar outro link</Link></p></PaginaAcesso>;
}
