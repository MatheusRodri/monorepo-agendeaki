'use client';

import { useState } from 'react';

export default function CampoSenha({ autoComplete, id, minLength = 6, nome, aoMudar, placeholder, rotulo, valor }) {
  const [visivel, definirVisivel] = useState(false);
  const descricaoAcao = `${visivel ? 'Ocultar' : 'Mostrar'} ${rotulo.toLowerCase()}`;

  return <label className="campo-formulario" htmlFor={id}><span>{rotulo}</span><div className="campo-senha"><input autoComplete={autoComplete} id={id} minLength={minLength} name={nome} onChange={aoMudar} placeholder={placeholder} required type={visivel ? 'text' : 'password'} value={valor} /><button aria-label={descricaoAcao} aria-pressed={visivel} onClick={() => definirVisivel(!visivel)} type="button"><IconeOlho visivel={visivel} /></button></div></label>;
}

function IconeOlho({ visivel }) {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20"><path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />{!visivel && <path d="M4 4 20 20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />}</svg>;
}
