'use client';

import { useEffect, useState } from 'react';
import { desativarNotificacoes, registrarVinculoPush } from '../../utils/notificacoesDispositivo';
import { requisitarApi } from '../../utils/api';
import { toastAviso, toastErro, toastSucesso } from '../../utils/toast';

export default function GerenciarNotificacoesCliente() {
  const [ativa, definirAtiva] = useState(false);
  const [processando, definirProcessando] = useState(true);
  const [permissao, definirPermissao] = useState('default');

  useEffect(() => {
    let ativo = true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      toastAviso('Este navegador não oferece suporte a notificações push.');
      definirProcessando(false);
      return () => { ativo = false; };
    }
    definirPermissao(Notification.permission);
    navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((inscricao) => requisitarApi(`/api/clientes/notificacoes/inscricao?endpoint=${encodeURIComponent(inscricao?.endpoint ?? '')}`))
      .then(async (resultado) => { if (ativo) { if (resultado.ativa) await registrarVinculoPush(resultado); definirAtiva(Boolean(resultado.ativa)); } })
      .catch((erro) => { if (ativo) toastErro(erro.message); })
      .finally(() => { if (ativo) definirProcessando(false); });
    return () => { ativo = false; };
  }, []);

  async function alternarNotificacoes() {
    definirProcessando(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      let inscricao = await registro.pushManager.getSubscription();
      if (ativa) {
        await desativarNotificacoes('cliente');
        definirAtiva(false);
        toastSucesso('Notificações desativadas neste dispositivo.');
        return;
      }
      const novaPermissao = await Notification.requestPermission();
      definirPermissao(novaPermissao);
      if (novaPermissao !== 'granted') throw new Error(novaPermissao === 'denied' ? 'As notificações estão bloqueadas nas permissões do navegador.' : 'Permita notificações para ativá-las.');
      const { chavePublica } = await requisitarApi('/api/clientes/notificacoes/chave-publica');
      const chaveBase64 = chavePublica.replace(/-/g, '+').replace(/_/g, '/');
      const chave = Uint8Array.from(atob(chaveBase64 + '='.repeat((4 - (chaveBase64.length % 4)) % 4)), (caractere) => caractere.charCodeAt(0));
      inscricao ??= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
      const vinculo = await requisitarApi('/api/clientes/notificacoes/inscricao', { metodo: 'POST', dados: inscricao.toJSON() });
      await registrarVinculoPush(vinculo);
      definirAtiva(true);
      toastSucesso('Notificações ativadas neste dispositivo.');
    } catch (erro) {
      toastErro(erro.message || 'Não foi possível alterar as notificações.');
    } finally { definirProcessando(false); }
  }

  return <section className="notificacoes-dispositivo">
    <div><strong>Notificações neste dispositivo</strong><p>Receba um aviso quando um atendimento estiver pronto para avaliar.</p></div>
    <button className="botao-secundario" disabled={processando} onClick={alternarNotificacoes} type="button">
      {processando ? 'Verificando...' : ativa ? 'Desativar notificações' : permissao === 'granted' ? 'Registrar este dispositivo' : 'Ativar notificações'}
    </button>
  </section>;
}
