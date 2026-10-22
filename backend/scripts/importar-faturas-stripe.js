import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { obterClienteStripe } from '../src/servicos/stripe.js';
import { salvarFaturaAssinatura } from '../src/servicos/faturasAssinaturas.js';

async function importar() {
  const stripe = obterClienteStripe();
  const assinaturas = await bancoDeDados.query(
    `SELECT DISTINCT id_assinatura_provedor AS idStripe
     FROM tb_assinatura_salao
     WHERE ds_provedor='STRIPE' AND id_assinatura_provedor IS NOT NULL`,
    { type: QueryTypes.SELECT },
  );
  let importadas = 0;
  let ignoradas = 0;
  for (const { idStripe } of assinaturas) {
    for await (const fatura of stripe.invoices.list({ limit: 100, subscription: idStripe })) {
      if (await salvarFaturaAssinatura(fatura)) importadas += 1;
      else ignoradas += 1;
    }
  }
  console.info(`[Stripe] Importação concluída: ${importadas} fatura(s) processada(s), ${ignoradas} sem assinatura local correspondente.`);
}

try {
  await importar();
} catch (erro) {
  console.error('[Stripe] Falha na importação de faturas.', erro.message);
  process.exitCode = 1;
} finally {
  await bancoDeDados.close();
}
