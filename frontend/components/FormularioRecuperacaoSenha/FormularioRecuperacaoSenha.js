'use client';

import Link from 'next/link';
import { useState } from 'react';
import { requisitarApi } from '../../utils/api';
import { toastErro, toastSucesso } from '../../utils/toast';

const configuracoes = {
  cliente: { caminho: 'cliente', rotaApi: 'clientes', titulo: 'Recupere sua senha.' },
  salao: { caminho: 'salao', rotaApi: 'saloes', titulo: 'Recupere o acesso.' },
};

export default function FormularioRecuperacaoSenha({ perfil }) {
  const configuracao = configuracoes[perfil];
  const [email, definirEmail] = useState('');
  const [enviando, definirEnviando] = useState(false);

  async function enviarFormulario(evento) {
    evento.preventDefault();
    definirEnviando(true);
    try {
      const dados = await requisitarApi(`/api/${configuracao.rotaApi}/recuperar-senha`, { dados: { email }, metodo: 'POST' });
      toastSucesso(dados.mensagem);
    } catch (erro) {
      toastErro(erro.message);
    } finally { definirEnviando(false); }
  }

  return <PaginaAcesso caminho={configuracao.caminho} descricao="Informe seu e-mail e enviaremos um link seguro para definir uma nova senha." titulo={configuracao.titulo}><form onSubmit={enviarFormulario}><label className="campo-formulario" htmlFor="email"><span>E-mail</span><input autoComplete="email" id="email" name="email" onChange={(evento) => definirEmail(evento.target.value)} placeholder="voce@exemplo.com" required type="email" value={email} /></label><button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Enviando...' : 'Enviar link de recuperação'} <span aria-hidden="true">→</span></button></form></PaginaAcesso>;
}

export function PaginaAcesso({ caminho, children, descricao, titulo }) {
  return <main className="pagina-autenticacao"><div className="pagina-autenticacao__painel"><Link className="marca" href="/"><span aria-hidden="true" className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><div className="pagina-autenticacao__texto"><span aria-hidden="true" className="pagina-autenticacao__icone">✦</span><p className="sobretitulo">Segurança da conta</p><h1>{titulo}</h1><p>{descricao}</p></div></div><section className="pagina-autenticacao__formulario"><div className="formulario-cartao"><Link className="voltar-home" href={`/${caminho}`}>← Voltar para o login</Link><div className="formulario-cartao__cabecalho"><p className="sobretitulo">Recuperação de senha</p><h2>{titulo}</h2><p>{descricao}</p></div>{children}</div></section></main>;
}
