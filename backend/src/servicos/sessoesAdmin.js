import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

export function compararSeguramente(a, b) {
  const recebido = Buffer.from(String(a));
  const esperado = Buffer.from(String(b));
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export function criarServicoSessoesAdmin({ banco = bancoDeDados, ambiente = process.env, agora = () => Date.now() } = {}) {
  const hash = (token) => createHash('sha256').update(token).digest('hex');
  const segredo = () => {
    const valor = ambiente.ADMIN_SESSION_SECRET;
    return valor && Buffer.byteLength(valor) >= 32 ? valor : null;
  };
  const assinar = (texto) => createHmac('sha256', segredo()).update(texto).digest('base64url');
  const versao = () => createHmac('sha256', segredo()).update(JSON.stringify([
    ambiente.ADMIN_EMAIL?.trim().toLowerCase(), ambiente.ADMIN_PASSWORD,
  ])).digest('hex');
  function ler(token) {
    if (!segredo() || !ambiente.ADMIN_PASSWORD || typeof token !== 'string' || token.length > 4096) return null;
    const [payload, assinatura, extra] = token.split('.');
    if (extra !== undefined || !payload || !assinatura || !compararSeguramente(assinatura, assinar(payload))) return null;
    try {
      const sessao = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (sessao.sub !== 'ADMIN_AGENDEAKI' || !sessao.sid || !Number.isFinite(sessao.exp)
        || sessao.exp <= agora() / 1000 || sessao.email !== ambiente.ADMIN_EMAIL?.trim()) return null;
      return sessao;
    } catch { return null; }
  }
  return {
    configurado: () => Boolean(segredo() && ambiente.ADMIN_EMAIL?.trim() && ambiente.ADMIN_PASSWORD),
    async criar(email) {
      const exp = Math.floor(agora() / 1000) + 8 * 60 * 60;
      const payload = Buffer.from(JSON.stringify({ sub: 'ADMIN_AGENDEAKI', sid: randomUUID(), email, exp })).toString('base64url');
      const token = `${payload}.${assinar(payload)}`;
      await banco.query('DELETE FROM tb_sessao_admin WHERE dt_expiracao <= :agora', { replacements: { agora: new Date(agora()) } });
      await banco.query(`INSERT INTO tb_sessao_admin (ds_token_hash, ds_credencial_versao, dt_expiracao)
        VALUES (:hash, :versao, :expiracao)`, { replacements: { hash: hash(token), versao: versao(), expiracao: new Date(exp * 1000) } });
      return token;
    },
    async validar(token, permitirRevogada = false) {
      const sessao = ler(token);
      if (!sessao) return null;
      const [registro] = await banco.query(`SELECT ds_credencial_versao AS versao, dt_revogacao AS revogada
        FROM tb_sessao_admin WHERE ds_token_hash=:hash AND dt_expiracao>:agora LIMIT 1`, {
        replacements: { hash: hash(token), agora: new Date(agora()) }, type: QueryTypes.SELECT,
      });
      if (!registro || (!permitirRevogada && registro.revogada) || !compararSeguramente(registro.versao, versao())) return null;
      return { email: sessao.email };
    },
    async revogar(token) {
      if (!await this.validar(token, true)) return false;
      await banco.query('UPDATE tb_sessao_admin SET dt_revogacao=COALESCE(dt_revogacao,:agora) WHERE ds_token_hash=:hash', {
        replacements: { hash: hash(token), agora: new Date(agora()) },
      });
      return true;
    },
  };
}

export const sessoesAdmin = criarServicoSessoesAdmin();
