import { parseArgs } from 'node:util';
import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { retomarExclusaoSalao } from '../src/servicos/exclusaoContaSalao.js';

const { values } = parseArgs({ options: { aplicar: { type: 'boolean', default: false } } });
try {
  const registros = await bancoDeDados.query("SELECT id_autenticacao_externa AS id FROM tb_exclusao_conta_salao WHERE cd_etapa<>'CONCLUIDA'", { type: QueryTypes.SELECT });
  console.info(`Exclusões pendentes: ${registros.length}.`);
  if (values.aplicar) {
    for (const registro of registros) {
      try { await retomarExclusaoSalao(registro.id); console.info('Uma exclusão foi concluída.'); }
      catch (erro) { console.error(`Uma exclusão continua pendente na etapa ${erro.etapa ?? 'desconhecida'}.`); process.exitCode = 1; }
    }
  } else console.info('Simulação. Use --aplicar para retomar as exclusões já solicitadas.');
} catch { console.error('Não foi possível consultar as exclusões pendentes.'); process.exitCode = 1; }
finally { await bancoDeDados.close(); }
