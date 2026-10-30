import { montarSerie } from './resumoDashboard.mjs';

export const diasDaSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const numero = (valor) => Math.max(0, Number(valor) || 0);
export const percentualDetalhado = (valor) => valor == null ? '—' : `${Number(valor).toFixed(1).replace('.', ',')}%`;

// "Outros" sempre conserva os dois totais, inclusive ao alternar o critério de ordenação.
export function rankingDetalhado(itens, criterio = 'quantidade') {
  const ordenados = itens.map((item) => ({ ...item, quantidade: numero(item.quantidade), receita: numero(item.receita) }))
    .sort((a, b) => b[criterio] - a[criterio] || a.nome.localeCompare(b.nome, 'pt-BR'));
  const total = ordenados.reduce((soma, item) => soma + item[criterio], 0);
  const exibidos = ordenados.slice(0, 5);
  if (ordenados.length > 5) {
    exibidos.splice(4, 1, { id: 'outros', nome: 'Outros',
      quantidade: ordenados.slice(4).reduce((soma, item) => soma + item.quantidade, 0),
      receita: ordenados.slice(4).reduce((soma, item) => soma + item.receita, 0) });
  }
  return exibidos.map((item) => ({ ...item, percentual: total ? item[criterio] / total * 100 : 0 }));
}

export function resumirAgenda(registros = []) {
  const dias = diasDaSemana.map((nome, indice) => ({ nome, diaSemana: (indice + 1) % 7, quantidade: 0 }));
  const celulas = new Map();
  for (const item of registros) {
    const dia = Number(item.diaSemana), hora = Number(item.hora);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6 || !Number.isInteger(hora) || hora < 0 || hora > 23) continue;
    const quantidade = numero(item.quantidade), cancelados = numero(item.cancelados);
    dias[(dia + 6) % 7].quantidade += quantidade;
    const chave = `${dia}:${hora}`, anterior = celulas.get(chave);
    celulas.set(chave, { diaSemana: dia, hora, quantidade: quantidade + (anterior?.quantidade ?? 0), cancelados: cancelados + (anterior?.cancelados ?? 0) });
  }
  const movimento = [...celulas.values()].filter((item) => item.quantidade > 0);
  const inicio = Math.min(8, ...movimento.map((item) => item.hora));
  const fim = Math.max(20, ...movimento.map((item) => item.hora));
  return { dias, celulas, horas: Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i),
    total: dias.reduce((soma, item) => soma + item.quantidade, 0),
    maximo: Math.max(1, ...movimento.map((item) => item.quantidade)) };
}

export function seriesFinanceiras(dados) {
  const inicio = dados.filtros?.dataInicio, fim = dados.filtros?.dataFim;
  return {
    atual: montarSerie(dados.receitaPorDia, inicio, fim, 'valor'),
    anterior: montarSerie(dados.visaoGeral?.receitaPorDiaAnterior, dados.periodoComparacao?.dataInicioAnterior, dados.periodoComparacao?.dataFimAnterior, 'valor'),
    inicio, fim,
  };
}

export function servicosDetalhados(dados) {
  return (dados.receitaPorServico ?? []).map((item) => ({ id: item.servico, nome: item.servico, quantidade: numero(item.quantidade), receita: numero(item.valor) }));
}

export function receitaPromocoes(dados) {
  const itens = (dados.promocoes?.ranking ?? []).map((item) => ({ id: `${item.idUnidade}:${item.idServico}`,
    nome: `${item.servico} · ${item.unidade}`, quantidade: numero(item.utilizacoes), receita: numero(item.receitaRealizada) }));
  // O ranking da API é limitado a dez serviços; o restante pertence a "Outros serviços".
  const restante = Math.max(0, Math.round((numero(dados.promocoes?.resumo?.receitaComPromocao) - itens.reduce((soma, item) => soma + item.receita, 0)) * 100) / 100);
  if (restante > 0) itens.push({ id: 'fora-ranking', nome: 'Outros serviços', quantidade: 0, receita: restante });
  return itens;
}

export function destaquesDetalhados(dados, dinheiro) {
  const servicos = servicosDetalhados(dados).filter((item) => item.quantidade > 0);
  const porQuantidade = [...servicos].sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));
  const porReceita = [...servicos].sort((a, b) => b.receita - a.receita || a.nome.localeCompare(b.nome, 'pt-BR'));
  const totalServicos = servicos.reduce((soma, item) => soma + item.quantidade, 0);
  const receita = numero(dados.resumo?.receitaRealizada), anterior = numero(dados.comparacaoAnterior?.receitaRealizada);
  const variacao = anterior > 0 ? (receita - anterior) / anterior * 100 : null;
  const destaque = (titulo, texto, tipo = 'positivo') => ({ titulo, texto, tipo });
  const oportunidade = (texto) => destaque('Oportunidade', texto, 'oportunidade');
  const vazio = (texto) => destaque('Sem movimento no período', texto, 'neutro');
  const agenda = resumirAgenda(dados.mapaCalor);
  const diasMovimentados = [...agenda.dias].sort((a, b) => b.quantidade - a.quantidade);
  const pico = [...agenda.celulas.values()].sort((a, b) => b.quantidade - a.quantidade || a.diaSemana - b.diaSemana || a.hora - b.hora)[0];
  const nomesDias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const profissionais = [...(dados.profissionais ?? [])].filter((item) => numero(item.atendimentosRealizados) > 0)
    .sort((a, b) => numero(b.atendimentosRealizados) - numero(a.atendimentosRealizados) || numero(b.receitaRealizada) - numero(a.receitaRealizada));
  const comGrade = [...(dados.profissionais ?? [])].filter((item) => item.ocupacaoEstimada != null)
    .sort((a, b) => Number(a.ocupacaoEstimada) - Number(b.ocupacaoEstimada));
  const promo = dados.promocoes?.resumo ?? {};
  const principal = porQuantidade[0], profissional = profissionais[0];
  return {
    financeiro: [variacao == null
      ? destaque('Receita do período', `${dinheiro(receita)} em serviços realizados. Sem receita no período anterior para calcular a variação.`, 'neutro')
      : destaque(variacao > 0 ? 'Receita em crescimento' : variacao < 0 ? 'Receita em queda' : 'Receita estável', `A receita ${variacao > 0 ? 'aumentou' : variacao < 0 ? 'diminuiu' : 'variou'} ${percentualDetalhado(Math.abs(variacao))} em relação ao período anterior.${porReceita[0] ? ` ${porReceita[0].nome} lidera a receita atual.` : ''}`, variacao < 0 ? 'alerta' : 'positivo'),
    oportunidade(porReceita.length > 1 ? `${porReceita.at(-1).nome} teve a menor receita entre os serviços realizados. Avalie a procura e a divulgação antes de definir uma ação.` : 'Compare a evolução da receita e o volume de serviços para orientar as próximas ações.')],
    servicos: [principal ? destaque(`${principal.nome} em destaque`, `Representa ${percentualDetalhado(principal.quantidade / totalServicos * 100)} dos serviços realizados e ${percentualDetalhado(receita ? principal.receita / receita * 100 : 0)} da receita do período.`) : vazio('Nenhum serviço realizado para os filtros selecionados.'),
    oportunidade(servicos.length > 1 ? `Compare quantidade e receita: ${[...servicos].sort((a, b) => b.receita / b.quantidade - a.receita / a.quantidade)[0].nome} tem o maior valor médio por serviço realizado.` : 'Use as duas visões para acompanhar a procura e o valor gerado por cada serviço.')],
    agenda: [agenda.total ? destaque(`${diasMovimentados[0].nome} concentra mais agendamentos`, `${percentualDetalhado(diasMovimentados[0].quantidade / agenda.total * 100)} dos agendamentos ativos ou realizados.${pico?.quantidade ? ` O maior pico por hora foi ${nomesDias[pico.diaSemana]}, às ${String(pico.hora).padStart(2, '0')}h.` : ''}`) : vazio('Nenhum agendamento ativo ou realizado pela data agendada no período.'),
    oportunidade(agenda.total ? `${diasMovimentados.at(-1).nome} teve o menor volume do período. Confira a disponibilidade desse dia antes de considerar uma promoção.` : 'Com novos agendamentos, os gráficos vão indicar os dias e horários de maior procura.')],
    profissionais: [profissional ? destaque(`${profissional.profissional} lidera em atendimentos`, `Participou de ${profissional.atendimentosRealizados} atendimento(s) realizado(s). ${profissional.ocupacaoEstimada == null ? 'Sem grade para estimar a ocupação.' : `Ocupação estimada de ${percentualDetalhado(profissional.ocupacaoEstimada)}.`}`) : vazio('Nenhum atendimento realizado pelos profissionais selecionados.'),
    oportunidade(comGrade.length ? `${comGrade[0].profissional} apresenta a menor ocupação estimada (${percentualDetalhado(comGrade[0].ocupacaoEstimada)}). Confira a grade e a distribuição dos horários.` : 'Cadastre a disponibilidade semanal da equipe para acompanhar a ocupação estimada.')],
    promocoes: [numero(promo.servicosComPromocao) ? destaque(`Promoções geraram ${dinheiro(promo.receitaComPromocao)}`, `${promo.servicosComPromocao} serviço(s) realizado(s) com promoção, equivalentes a ${percentualDetalhado(promo.participacaoPromocoes)} dos serviços com classificação conhecida. Esse valor representa receita realizada.`) : vazio('Nenhum serviço realizado com promoção para estes filtros.'),
    oportunidade('Considere ofertas em horários com menor procura e acompanhe sua utilização e receita nos próximos períodos.')],
  };
}
