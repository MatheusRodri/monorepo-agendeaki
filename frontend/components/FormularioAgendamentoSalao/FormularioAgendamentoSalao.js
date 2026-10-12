'use client';

import { useEffect, useMemo, useState } from 'react';

function dataLocal(data = new Date()) {
  const deslocamento = data.getTimezoneOffset() * 60000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 10);
}

export default function FormularioAgendamentoSalao({ clientes, filiais, funcionarios, mostrarToastErro, requisitar, servicos, aoCancelar, aoSalvar }) {
  const [idUnidade, definirIdUnidade] = useState('');
  const [idServico, definirIdServico] = useState('');
  const [idFuncionario, definirIdFuncionario] = useState('');
  const [data, definirData] = useState('');
  const [horario, definirHorario] = useState('');
  const [horarios, definirHorarios] = useState([]);
  const [modoCliente, definirModoCliente] = useState('novo');
  const [idClienteSalao, definirIdClienteSalao] = useState('');
  const [buscaCliente, definirBuscaCliente] = useState('');
  const [nome, definirNome] = useState('');
  const [telefone, definirTelefone] = useState('');
  const [email, definirEmail] = useState('');
  const [observacao, definirObservacao] = useState('');
  const [mensagem, definirMensagem] = useState('');
  const [carregandoHorarios, definirCarregandoHorarios] = useState(false);
  const [enviando, definirEnviando] = useState(false);

  const servicosFilial = useMemo(() => servicos.filter((item) => String(item.idUnidade) === idUnidade), [idUnidade, servicos]);
  const funcionariosFilial = useMemo(() => funcionarios.filter((item) => String(item.idUnidade) === idUnidade), [funcionarios, idUnidade]);
  const clientesFiltrados = useMemo(() => {
    const termo = buscaCliente.trim().toLocaleLowerCase('pt-BR');
    return clientes.filter((cliente) => cliente.idClienteSalao && (!termo || [cliente.nome, cliente.email, cliente.telefone].some((valor) => String(valor ?? '').toLocaleLowerCase('pt-BR').includes(termo))));
  }, [buscaCliente, clientes]);
  const dataMaxima = useMemo(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() + 60);
    return dataLocal(limite);
  }, []);

  useEffect(() => {
    if (!idUnidade || !idServico || !data) { definirHorarios([]); definirCarregandoHorarios(false); return undefined; }
    let ativo = true;
    definirHorario(''); definirCarregandoHorarios(true); definirMensagem('');
    const parametros = new URLSearchParams({ data, idServico, idUnidade });
    if (idFuncionario) parametros.set('idFuncionario', idFuncionario);
    requisitar(`/agendamentos/horarios?${parametros}`)
      .then((resultado) => { if (ativo) { definirHorarios(resultado.horarios); if (!resultado.horarios.length) definirMensagem('Não há horários disponíveis nesta data.'); } })
      .catch((erro) => { if (ativo) { definirHorarios([]); definirMensagem(''); mostrarToastErro(erro.message); } })
      .finally(() => { if (ativo) definirCarregandoHorarios(false); });
    return () => { ativo = false; };
  }, [data, idFuncionario, idServico, idUnidade, mostrarToastErro, requisitar]);

  async function confirmar(evento) {
    evento.preventDefault();
    if (!idUnidade || !idServico || !data || !horario || (modoCliente === 'existente' && !idClienteSalao)) return;
    definirEnviando(true); definirMensagem('');
    try {
      const dados = {
        dataHoraInicio: `${data}T${horario}:00`,
        idFuncionario: idFuncionario ? Number(idFuncionario) : null,
        idServico: Number(idServico), idUnidade: Number(idUnidade), observacao,
        ...(modoCliente === 'existente'
          ? { idClienteSalao: Number(idClienteSalao) }
          : { cliente: { nome, telefone, email } }),
      };
      const resultado = await requisitar('/agendamentos', { method: 'POST', body: JSON.stringify(dados) });
      await aoSalvar(resultado.mensagem);
    } catch (erro) { definirMensagem(''); mostrarToastErro(erro.message); }
    finally { definirEnviando(false); }
  }

  return <form className="formulario-salao formulario-agendamento-manual" onSubmit={confirmar}>
    <h2>Novo agendamento</h2>
    <p>Escolha um horário disponível e registre o atendimento na agenda do salão.</p>
    <div className="grade-formulario">
      <label className="campo-formulario"><span>Filial</span><select onChange={(evento) => { definirIdUnidade(evento.target.value); definirIdServico(''); definirIdFuncionario(''); definirData(''); definirHorario(''); }} required value={idUnidade}><option value="">Selecione</option>{filiais.map((filial) => <option key={filial.idUnidade} value={filial.idUnidade}>{filial.nome}</option>)}</select></label>
      <label className="campo-formulario"><span>Serviço</span><select disabled={!idUnidade} onChange={(evento) => { definirIdServico(evento.target.value); definirIdFuncionario(''); definirData(''); definirHorario(''); }} required value={idServico}><option value="">Selecione</option>{servicosFilial.map((servico) => <option key={servico.idServico} value={servico.idServico}>{servico.nome} · {servico.duracaoMinutos} min · R$ {Number(servico.valor).toFixed(2).replace('.', ',')}</option>)}</select></label>
      <label className="campo-formulario"><span>Profissional</span><select disabled={!idServico} onChange={(evento) => { definirIdFuncionario(evento.target.value); definirHorario(''); }} value={idFuncionario}><option value="">Qualquer profissional disponível</option>{funcionariosFilial.map((funcionario) => <option key={funcionario.idFuncionario} value={funcionario.idFuncionario}>{funcionario.nome}</option>)}</select></label>
      <label className="campo-formulario"><span>Data</span><input disabled={!idServico} max={dataMaxima} min={dataLocal()} onChange={(evento) => { definirData(evento.target.value); definirHorario(''); }} required type="date" value={data} /></label>
      {data && <label className="campo-formulario"><span>Horário disponível</span><select disabled={carregandoHorarios || !horarios.length} onChange={(evento) => definirHorario(evento.target.value)} required value={horario}><option value="">{carregandoHorarios ? 'Consultando horários...' : 'Selecione'}</option>{horarios.map((item) => <option key={item.inicio} value={item.inicio}>{item.inicio}</option>)}</select></label>}
    </div>

    <fieldset className="selecao-cliente-manual">
      <legend>Cliente</legend>
      <div className="opcoes-cliente-manual"><label><input checked={modoCliente === 'novo'} name="modoCliente" onChange={() => { definirModoCliente('novo'); definirMensagem(''); }} type="radio" value="novo" /> Novo cliente</label><label><input checked={modoCliente === 'existente'} name="modoCliente" onChange={() => { definirModoCliente('existente'); definirMensagem(''); }} type="radio" value="existente" /> Cliente já cadastrado</label></div>
      {modoCliente === 'novo' ? <div className="grade-formulario"><label className="campo-formulario"><span>Nome</span><input maxLength="120" onChange={(evento) => definirNome(evento.target.value)} required value={nome} /></label><label className="campo-formulario"><span>Telefone <small>Opcional</small></span><input maxLength="20" onChange={(evento) => definirTelefone(evento.target.value)} value={telefone} /></label><label className="campo-formulario"><span>Email <small>Opcional</small></span><input maxLength="254" onChange={(evento) => definirEmail(evento.target.value)} type="email" value={email} /></label></div> : <div className="grade-formulario"><label className="campo-formulario"><span>Buscar cliente</span><input onChange={(evento) => { definirBuscaCliente(evento.target.value); definirIdClienteSalao(''); }} placeholder="Nome, telefone ou email" value={buscaCliente} /></label><label className="campo-formulario"><span>Selecionar ficha</span><select onChange={(evento) => definirIdClienteSalao(evento.target.value)} required value={idClienteSalao}><option value="">{clientesFiltrados.length ? 'Selecione' : 'Nenhuma ficha encontrada'}</option>{clientesFiltrados.map((cliente) => <option key={cliente.idClienteSalao} value={cliente.idClienteSalao}>{cliente.nome}{cliente.telefone ? ` · ${cliente.telefone}` : ''}</option>)}</select></label></div>}
    </fieldset>
    <label className="campo-formulario"><span>Observação <small>Opcional</small></span><textarea maxLength="500" onChange={(evento) => definirObservacao(evento.target.value)} value={observacao} /></label>
    {mensagem && <p className="estado-lista">{mensagem}</p>}
    <div className="acoes-formulario"><button className="botao-enviar" disabled={enviando || carregandoHorarios || !horario} type="submit">{enviando ? 'Salvando...' : 'Confirmar agendamento'} <span>→</span></button><button className="botao-secundario" onClick={aoCancelar} type="button">Cancelar</button></div>
  </form>;
}
