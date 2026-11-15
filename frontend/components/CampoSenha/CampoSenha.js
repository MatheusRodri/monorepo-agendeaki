'use client';

import { useEffect, useRef, useState } from 'react';
import { avaliarSenha } from '../../utils/senha';

export default function CampoSenha({ autoComplete, compararCom, exibirRegras = false, id, minLength = 6, nome, aoMudar, placeholder, rotulo, valor }) {
  const campo = useRef(null);
  const [visivel, definirVisivel] = useState(false);
  const descricaoAcao = `${visivel ? 'Ocultar' : 'Mostrar'} ${rotulo.toLowerCase()}`;
  const regras = exibirRegras ? avaliarSenha(valor) : [];
  const atendidas = regras.filter((regra) => regra.atendida).length;
  const comparar = compararCom !== undefined;
  const diverge = comparar && valor.length > 0 && valor !== compararCom;
  const coincide = comparar && valor.length > 0 && valor === compararCom;
  const idsDescricao = [exibirRegras ? `${id}-regras` : null, diverge || coincide ? `${id}-confirmacao` : null].filter(Boolean).join(' ') || undefined;

  useEffect(() => {
    if (!campo.current) return;
    if (exibirRegras) {
      const pendentes = avaliarSenha(valor).filter((regra) => !regra.atendida);
      campo.current.setCustomValidity(valor && pendentes.length ? `A senha precisa ter: ${pendentes.map((regra) => regra.rotulo.toLowerCase()).join(', ')}.` : '');
      return;
    }
    if (comparar) campo.current.setCustomValidity(diverge ? 'As senhas não coincidem.' : '');
  }, [comparar, diverge, exibirRegras, valor]);

  return <label className="campo-formulario" htmlFor={id}><span>{rotulo}</span><div className="campo-senha"><input aria-describedby={idsDescricao} aria-invalid={diverge || undefined} autoComplete={autoComplete} id={id} minLength={exibirRegras ? 8 : minLength} name={nome} onChange={aoMudar} placeholder={placeholder} ref={campo} required type={visivel ? 'text' : 'password'} value={valor} /><button aria-label={descricaoAcao} aria-pressed={visivel} onClick={() => definirVisivel(!visivel)} type="button"><IconeOlho visivel={visivel} /></button></div>{exibirRegras && <><ul className="regras-senha" id={`${id}-regras`}>{regras.map((regra) => <li className={`regras-senha__item regras-senha__item--${regra.atendida ? 'ok' : valor ? 'pendente' : 'neutro'}`} key={regra.id}><span aria-hidden="true">{regra.atendida ? '✓' : '○'}</span><span className="visualmente-oculto">{regra.atendida ? 'Atendida: ' : 'Pendente: '}</span>{regra.rotulo}</li>)}</ul><p aria-live="polite" className="visualmente-oculto">{atendidas} de {regras.length} requisitos da senha atendidos.</p></>}{(diverge || coincide) && <p className={`confirmacao-senha regras-senha__item regras-senha__item--${diverge ? 'pendente' : 'ok'}`} id={`${id}-confirmacao`} role="status"><span aria-hidden="true">{diverge ? '○' : '✓'}</span>{diverge ? 'As senhas não coincidem.' : 'As senhas coincidem.'}</p>}</label>;
}

function IconeOlho({ visivel }) {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20"><path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />{!visivel && <path d="M4 4 20 20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />}</svg>;
}
