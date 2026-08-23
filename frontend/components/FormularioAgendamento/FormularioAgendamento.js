'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AlternadorTema from '../AlternadorTema/AlternadorTema';
import { lerRespostaApi, obterTokenAcesso, obterUrlApi } from '../../utils/respostaApi';

export default function FormularioAgendamento() {
  const parametros = useSearchParams();
  const [dataHoraInicio, definirDataHoraInicio] = useState('');
  const [observacao, definirObservacao] = useState('');
  const [mensagem, definirMensagem] = useState('');
  const [tipoMensagem, definirTipoMensagem] = useState('sucesso');
  const [enviando, definirEnviando] = useState(false);

  async function criarAgendamento(evento) {
    evento.preventDefault();
    definirEnviando(true);
    definirMensagem('');

    try {
      const tokenAcesso = obterTokenAcesso();
      const urlApi = obterUrlApi();
      const resposta = await fetch(`${urlApi}/api/clientes/agendamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tokenAcesso ? { Authorization: `Bearer ${tokenAcesso}` } : {}) },
        body: JSON.stringify({
          idUnidade: parametros.get('idUnidade'),
          idServico: parametros.get('idServico'),
          idFuncionario: parametros.get('idFuncionario'),
          dataHoraInicio,
          observacao,
        }),
      });
      const { dados: dadosResposta, mensagem: mensagemResposta } = await lerRespostaApi(resposta);
      if (!resposta.ok) throw new Error(dadosResposta.mensagem ?? mensagemResposta ?? 'Não foi possível realizar o agendamento.');
      definirMensagem('Agendamento confirmado! Veja seus próximos horários.');
      definirTipoMensagem('sucesso');
    } catch (erro) {
      definirMensagem(erro.message);
      definirTipoMensagem('erro');
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <main className="pagina-formulario-cliente"><header className="cabecalho-area"><Link aria-label="AgendeAki: página inicial" className="marca" href="/"><span aria-hidden="true" className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link><nav aria-label="Navegação do cliente"><Link href="/cliente/inicio">Explorar</Link><Link href="/cliente/agendamentos">Agendamentos</Link><Link href="/cliente/configuracoes">Configurações</Link></nav><AlternadorTema /></header><div className="conteudo-formulario-cliente"><Link className="voltar-home" href="/cliente/inicio">← Voltar para salões</Link><p className="sobretitulo">Reserve seu momento</p><h1>Escolha o melhor horário para você.</h1><p>Confirme a data desejada. Nós verificaremos a disponibilidade do profissional antes de reservar.</p><form className="formulario-agendamento" onSubmit={criarAgendamento}><label className="campo-formulario" htmlFor="dataHoraInicio"><span>Data e horário</span><input id="dataHoraInicio" min={new Date().toISOString().slice(0, 16)} onChange={(evento) => definirDataHoraInicio(evento.target.value)} required type="datetime-local" value={dataHoraInicio} /></label><label className="campo-formulario" htmlFor="observacao"><span>Alguma observação? <small>Opcional</small></span><textarea id="observacao" maxLength="500" onChange={(evento) => definirObservacao(evento.target.value)} placeholder="Conte ao profissional algo importante para o atendimento." value={observacao} /></label>{mensagem && <p className={`mensagem-formulario mensagem-formulario--${tipoMensagem}`}>{mensagem}</p>}<button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Confirmando...' : 'Confirmar agendamento'} <span>→</span></button></form>{mensagem.startsWith('Agendamento confirmado') && <Link className="link-proximos" href="/cliente/agendamentos">Ver meus agendamentos →</Link>}</div></main>
  );
}
