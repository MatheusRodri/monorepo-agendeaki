function erroPromocao(mensagem) {
  return Object.assign(new Error(mensagem), { status: 400, codigo: 'PROMOCAO_INVALIDA' });
}

export function normalizarValorServico(valor) {
  if (!['number', 'string'].includes(typeof valor) || !/^\d+(?:\.\d{1,2})?$/.test(String(valor))
    || !Number.isFinite(Number(valor)) || Number(valor) > 99999999.99) {
    throw erroPromocao('Informe um valor não negativo com até duas casas decimais.');
  }
  return Number(valor).toFixed(2);
}

function normalizarData(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw erroPromocao('Informe uma data válida para a promoção.');
  const data = new Date(`${valor}T12:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor || valor < '1000-01-01') {
    throw erroPromocao('Informe uma data válida para a promoção.');
  }
  return valor;
}

export function normalizarPromocao(promocao, valorNormal) {
  if (promocao === null) return null;
  if (!promocao || typeof promocao !== 'object' || Array.isArray(promocao)
    || typeof promocao.ativa !== 'boolean' || !['PRECO_FIXO', 'PERCENTUAL'].includes(promocao.tipo)) {
    throw erroPromocao('Informe o tipo, o valor e a ativação da promoção.');
  }
  const valor = Number(normalizarValorServico(promocao.valor));
  const base = Number(normalizarValorServico(valorNormal));
  if (promocao.tipo === 'PERCENTUAL' && (valor <= 0 || valor > 100)) {
    throw erroPromocao('O desconto deve ser maior que zero e até 100%.');
  }
  const normalizada = { ativa: promocao.ativa, tipo: promocao.tipo, valor,
    dataInicio: normalizarData(promocao.dataInicio), dataFim: normalizarData(promocao.dataFim) };
  if (normalizada.dataInicio && normalizada.dataFim && normalizada.dataFim < normalizada.dataInicio) {
    throw erroPromocao('O término da promoção deve ser igual ou posterior ao início.');
  }
  if (normalizada.ativa && calcularValorPromocional(base, normalizada) >= base) {
    throw erroPromocao('O preço promocional deve ser inferior ao preço normal.');
  }
  return normalizada;
}

export function calcularValorPromocional(valorNormal, promocao) {
  const centavos = Math.round(Number(valorNormal) * 100);
  if (promocao.tipo === 'PRECO_FIXO') return Number(promocao.valor);
  const percentual = Math.round(Number(promocao.valor) * 100);
  return Math.round(centavos * (10000 - percentual) / 10000) / 100;
}

export function resolverPromocaoEdicao(dados, anterior, valorNormal, premiumAtivo) {
  const recebida = Object.hasOwn(dados, 'promocao') ? normalizarPromocao(dados.promocao, valorNormal) : anterior;
  if (!premiumAtivo && JSON.stringify(recebida) !== JSON.stringify(anterior)) {
    throw Object.assign(new Error('As promoções são um recurso disponível para assinantes Premium.'), {
      status: 403, codigo: 'PREMIUM_NECESSARIO',
    });
  }
  return recebida ? normalizarPromocao(recebida, valorNormal) : null;
}

export function precoServico(valorNormal, promocao, premiumAtivo, agora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(agora).map(({ type, value }) => [type, value]));
  const hoje = `${partes.year}-${partes.month}-${partes.day}`;
  let statusPromocao = 'SEM_PROMOCAO';
  if (promocao) {
    if (!promocao.ativa) statusPromocao = 'DESATIVADA';
    else if (!premiumAtivo) statusPromocao = 'SUSPENSA';
    else if (promocao.dataInicio && hoje < promocao.dataInicio) statusPromocao = 'AGENDADA';
    else if (promocao.dataFim && hoje > promocao.dataFim) statusPromocao = 'ENCERRADA';
    else statusPromocao = 'ATIVA';
  }
  const valorOriginal = Number(valorNormal);
  const promocaoAtiva = statusPromocao === 'ATIVA';
  return { valorOriginal, valorVigente: promocaoAtiva ? calcularValorPromocional(valorOriginal, promocao) : valorOriginal,
    promocaoAtiva, statusPromocao };
}

// Os aliases são constantes do código, nunca dados recebidos da requisição.
export function camposPromocaoSql(alias) {
  return `${alias}.tp_promocao AS promocaoTipo, ${alias}.vl_promocao AS promocaoValor,
    ${alias}.st_promocao_ativa AS promocaoHabilitada,
    DATE_FORMAT(${alias}.dt_promocao_inicio, '%Y-%m-%d') AS promocaoInicio,
    DATE_FORMAT(${alias}.dt_promocao_fim, '%Y-%m-%d') AS promocaoFim`;
}

export function lerPromocao(linha) {
  return linha.promocaoTipo ? { ativa: Boolean(linha.promocaoHabilitada), tipo: linha.promocaoTipo,
    valor: Number(linha.promocaoValor), dataInicio: linha.promocaoInicio, dataFim: linha.promocaoFim } : null;
}

export function apresentarServico(linha, premiumAtivo, administrativo = false, agora = new Date()) {
  const { promocaoTipo, promocaoValor, promocaoHabilitada, promocaoInicio, promocaoFim, ...servico } = linha;
  const promocao = lerPromocao(linha);
  const preco = precoServico(linha.valor, promocao, premiumAtivo, agora);
  return { ...servico, ...preco, valor: administrativo ? preco.valorOriginal : preco.valorVigente,
    ...(administrativo ? { promocao } : {}) };
}

export function validarValorEsperado(valorEsperado, valorVigente) {
  if (valorEsperado === undefined) return;
  const esperado = normalizarValorServico(valorEsperado);
  if (esperado !== Number(valorVigente).toFixed(2)) {
    throw Object.assign(new Error('O preço do serviço mudou. Revise os valores antes de confirmar novamente.'), {
      status: 409, codigo: 'PRECO_ALTERADO',
    });
  }
}
