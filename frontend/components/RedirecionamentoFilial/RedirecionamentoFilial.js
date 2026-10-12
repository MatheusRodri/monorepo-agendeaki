'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requisitarApi } from '../../utils/api';
import { toastErro } from '../../utils/toast';

export default function RedirecionamentoFilial({ idUnidade }) {
  const roteador = useRouter();
  const [mensagem, definirMensagem] = useState('Abrindo a página de agendamento...');
  useEffect(() => {
    requisitarApi(`/api/publico/agendamento/unidade/${idUnidade}`)
      .then((dados) => roteador.replace(dados.caminho))
      .catch((erro) => { definirMensagem('Não foi possível abrir a página desta filial.'); toastErro(erro.message); });
  }, [idUnidade, roteador]);
  return <main className="pagina-agendamento-publico"><p className="estado-lista">{mensagem}</p></main>;
}
