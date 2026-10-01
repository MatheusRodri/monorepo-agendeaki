'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { requisitarApi } from '../../utils/api';

export default function FormularioAgendamento() {
  const parametros = useSearchParams();
  const roteador = useRouter();
  const [mensagem, definirMensagem] = useState('Abrindo a agenda da filial...');

  useEffect(() => {
    const idUnidade = parametros.get('idUnidade');
    if (!idUnidade) { definirMensagem('Informe uma filial para iniciar o agendamento.'); return; }
    requisitarApi(`/api/publico/agendamento/unidade/${idUnidade}`).then((dados) => {
      const destino = new URLSearchParams();
      if (parametros.get('idServico')) destino.set('servico', parametros.get('idServico'));
      if (parametros.get('idFuncionario')) destino.set('profissional', parametros.get('idFuncionario'));
      roteador.replace(`${dados.caminho}${destino.size ? `?${destino}` : ''}`);
    }).catch((erro) => definirMensagem(erro.message));
  }, [parametros, roteador]);

  return <main className="pagina-formulario-cliente"><p className="estado-lista">{mensagem}</p></main>;
}
