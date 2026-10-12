import { toast } from 'react-toastify';

const opcoesPadrao = { autoClose: 15000 };

export function toastErro(mensagem, opcoes = {}) {
  if (mensagem) toast.error(mensagem, { ...opcoesPadrao, ...opcoes });
}

export function toastSucesso(mensagem, opcoes = {}) {
  if (mensagem) toast.success(mensagem, { ...opcoesPadrao, ...opcoes });
}

export function toastAviso(mensagem, opcoes = {}) {
  if (mensagem) toast.warn(mensagem, { ...opcoesPadrao, ...opcoes });
}

export function toastInfo(mensagem, opcoes = {}) {
  if (mensagem) toast.info(mensagem, { ...opcoesPadrao, ...opcoes });
}
