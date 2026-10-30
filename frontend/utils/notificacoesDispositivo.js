import { requisitarApi } from './api';
import { limparSessao, obterIdentidadeSessao, obterTokenAcesso } from './respostaApi';

export async function comandarVinculo(type, dados = {}) {
  if (!('serviceWorker' in navigator)) return [];
  const registro = await navigator.serviceWorker.getRegistration();
  const worker = registro?.active;
  if (!worker) return [];
  return new Promise((resolve, reject) => {
    const canal = new MessageChannel();
    const limite = setTimeout(() => { canal.port1.close(); reject(new Error('Não foi possível atualizar o vínculo do dispositivo.')); }, 2500);
    canal.port1.onmessage = ({ data }) => {
      clearTimeout(limite); canal.port1.close();
      if (data.erro) reject(new Error('Não foi possível atualizar o vínculo do dispositivo.'));
      else resolve(data.vinculos ?? []);
    };
    worker.postMessage({ type: `AGENDEAKI_VINCULO_${type}`, ...dados }, [canal.port2]);
  });
}

export async function registrarVinculoPush(resultado) {
  if (resultado?.idVinculo) await comandarVinculo('SALVAR', resultado);
}

export async function desativarNotificacoes(perfil, { tokenAcesso = obterTokenAcesso(perfil) } = {}) {
  const destinatarioId = obterIdentidadeSessao(perfil);
  const registro = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  const inscricao = await registro?.pushManager?.getSubscription();
  const vinculos = await comandarVinculo('LISTAR');
  const vinculo = vinculos.find((v) => v.audience === perfil && v.destinatarioId === destinatarioId);
  const restantes = await comandarVinculo('REMOVER', { audience: perfil, destinatarioId, idVinculo: vinculo?.idVinculo });
  const dados = { endpointPush: inscricao?.endpoint, idVinculo: vinculo?.idVinculo };
  let falha;
  if (!restantes.length && inscricao) { try { await inscricao.unsubscribe(); } catch (erro) { falha = erro; } }
  try { if (inscricao && vinculo && tokenAcesso) await requisitarApi(`/api/${perfil === 'cliente' ? 'clientes' : 'salao'}/notificacoes/inscricao`, {
    metodo: 'DELETE', dados: { endpoint: inscricao.endpoint, idVinculo: vinculo.idVinculo }, tokenAcesso, timeout: 4000,
  }); } catch (erro) { falha = erro; }
  if (falha) throw Object.assign(falha, { dados });
  return dados;
}

export async function encerrarSessaoPerfil(perfil) {
  const tokenAcesso = obterTokenAcesso(perfil);
  const sessaoInicial = identificarSessao(tokenAcesso);
  let dados, confirmado = true;
  try { if (perfil !== 'admin') dados = await desativarNotificacoes(perfil, { tokenAcesso }); } catch (erro) { dados = erro.dados; confirmado = false; }
  try {
    await requisitarApi(`/api/${perfil === 'salao' ? 'saloes' : perfil === 'cliente' ? 'clientes' : 'admin'}/logout`, {
      metodo: 'POST', dados, tokenAcesso, timeout: 5000,
    });
  } catch { confirmado = false; }
  finally {
    const atual = obterTokenAcesso(perfil);
    if (atual === tokenAcesso || (sessaoInicial && identificarSessao(atual) === sessaoInicial)) limparSessao(perfil);
  }
  return confirmado;
}

function identificarSessao(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return payload.session_id || payload.sid || null;
  } catch { return null; }
}
