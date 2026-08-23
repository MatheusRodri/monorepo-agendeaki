'use client';

export default function ModalConfirmacaoEmail({ aoFechar, email }) {
  return <div className="modal-conta" role="dialog" aria-modal="true" aria-labelledby="titulo-confirmacao-email"><section><span aria-hidden="true">✉</span><p className="sobretitulo">Quase lá</p><h2 id="titulo-confirmacao-email">Confirme seu e-mail.</h2><p>Enviamos um link de confirmação para <strong>{email}</strong>. Abra sua caixa de entrada e confirme a conta antes de fazer login.</p><button className="botao-enviar" onClick={aoFechar} type="button">Ir para o login →</button></section></div>;
}
