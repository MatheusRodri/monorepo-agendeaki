'use client';

import { useEffect, useState } from 'react';
import { formatarTelefone } from '../../utils/formatadores';

export default function FormularioDadosSalao({ emailConta, salao, salvar }) {
  const [usarEmailConta, definirUsarEmailConta] = useState(!salao?.email && Boolean(emailConta));
  const [email, definirEmail] = useState(salao?.email ?? '');
  const [telefone, definirTelefone] = useState(formatarTelefone(salao?.telefone));

  useEffect(() => { definirUsarEmailConta(!salao?.email && Boolean(emailConta)); definirEmail(salao?.email ?? ''); definirTelefone(formatarTelefone(salao?.telefone)); }, [emailConta, salao]);

  function enviar(evento) {
    salvar(evento, salao ? '/saloes/atual' : '/saloes', salao ? 'PATCH' : 'POST', { email: usarEmailConta ? emailConta : email });
  }

  return <form className="formulario-salao grade-formulario" onSubmit={enviar}><label className="campo-formulario"><span>Nome do salão</span><input defaultValue={salao?.nome ?? ''} name="nome" required /></label><label className="campo-formulario"><span>E-mail de atendimento</span><input disabled={usarEmailConta} name="email" onChange={(evento) => definirEmail(evento.target.value)} required={!usarEmailConta} type="email" value={usarEmailConta ? emailConta ?? '' : email} /></label>{emailConta && <label className="campo-formulario campo-formulario--checkbox"><input checked={usarEmailConta} onChange={(evento) => definirUsarEmailConta(evento.target.checked)} type="checkbox" /> Usar o mesmo e-mail da conta ({emailConta})</label>}<label className="campo-formulario"><span>Telefone</span><input inputMode="numeric" name="telefone" onChange={(evento) => definirTelefone(formatarTelefone(evento.target.value))} placeholder="(00) 00000-0000" value={telefone} /></label><button className="botao-enviar">{salao ? 'Salvar alterações' : 'Criar salão'} <span>→</span></button></form>;
}
