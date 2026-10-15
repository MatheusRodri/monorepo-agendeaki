'use client';

import { useEffect, useRef, useState } from 'react';
import { formatarCnpj, formatarTelefone } from '../../utils/formatadores';
import MapaAjusteFilial from '../MapaAjusteFilial/MapaAjusteFilial';

const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function formatarCep(valor) {
  const numeros = String(valor ?? '').replace(/\D/g, '').slice(0, 8);
  return numeros.length > 5 ? `${numeros.slice(0, 5)}-${numeros.slice(5)}` : numeros;
}

function criarHorarios(horarios = []) {
  return diasSemana.map((_, diaSemana) => {
    const horarioSalvo = horarios.find((horario) => Number(horario.diaSemana) === diaSemana);
    const diaUtil = diaSemana >= 1 && diaSemana <= 5;
    return {
      abertura: horarioSalvo?.abertura?.slice(0, 5) ?? (diaUtil ? '09:00' : ''),
      diaSemana,
      fechado: horarioSalvo ? Boolean(horarioSalvo.fechado) : !diaUtil,
      fechamento: horarioSalvo?.fechamento?.slice(0, 5) ?? (diaUtil ? '18:00' : ''),
    };
  });
}

export default function FormularioFilial({ endereco, filial, buscarCep, buscarCoordenadas, salvarFilial, responsavel }) {
  const [cep, definirCep] = useState(formatarCep(filial?.cep));
  const [numero, definirNumero] = useState(filial?.numero ?? '');
  const [telefone, definirTelefone] = useState(formatarTelefone(filial?.telefone ?? responsavel?.telefone));
  const [email, definirEmail] = useState(filial?.email ?? responsavel?.email ?? '');
  const [documento, definirDocumento] = useState(formatarCnpj(filial?.documento));
  const [usarDadosResponsavel, definirUsarDadosResponsavel] = useState(!filial);
  const [coordenadas, definirCoordenadas] = useState(filial?.latitude != null && filial?.longitude != null ? { latitude: Number(filial.latitude), longitude: Number(filial.longitude) } : null);
  const [horarios, definirHorarios] = useState(criarHorarios(filial?.horarios));
  const [sugestoesEndereco, definirSugestoesEndereco] = useState([]);
  const [buscandoCep, definirBuscandoCep] = useState(false);
  const [buscandoEndereco, definirBuscandoEndereco] = useState(false);
  const [salvando, definirSalvando] = useState(false);
  const temporizadorCep = useRef(null);

  useEffect(() => {
    definirCep(formatarCep(filial?.cep));
    definirNumero(filial?.numero ?? '');
    definirTelefone(formatarTelefone(filial ? filial.telefone : responsavel?.telefone));
    definirEmail(filial ? filial.email ?? '' : responsavel?.email ?? '');
    definirDocumento(formatarCnpj(filial?.documento));
    definirUsarDadosResponsavel(!filial);
    definirCoordenadas(filial?.latitude != null && filial?.longitude != null ? { latitude: Number(filial.latitude), longitude: Number(filial.longitude) } : null);
    definirHorarios(criarHorarios(filial?.horarios));
    definirSugestoesEndereco([]);
  }, [filial, responsavel]);

  function copiarDadosResponsavel(checked) {
    definirUsarDadosResponsavel(checked);
    if (!checked) return;
    definirEmail(responsavel?.email ?? '');
    definirTelefone(formatarTelefone(responsavel?.telefone));
  }

  useEffect(() => () => clearTimeout(temporizadorCep.current), []);

  function alterarCep(evento) {
    const novoCep = formatarCep(evento.target.value);
    definirCep(novoCep);
    definirCoordenadas(null);
    definirSugestoesEndereco([]);
    clearTimeout(temporizadorCep.current);
    if (novoCep.replace(/\D/g, '').length !== 8) return;
    temporizadorCep.current = setTimeout(async () => {
      definirBuscandoCep(true);
      try {
        await buscarCep(novoCep);
      } finally {
        definirBuscandoCep(false);
      }
    }, 400);
  }

  function alterarNumero(evento) {
    definirNumero(evento.target.value);
    definirCoordenadas(null);
    definirSugestoesEndereco([]);
  }

  async function localizarEndereco() {
    if (cep.replace(/\D/g, '').length !== 8 || !numero.trim()) return;
    definirBuscandoEndereco(true);
    try {
      const resultado = await buscarCoordenadas(cep, numero);
      definirSugestoesEndereco(resultado?.sugestoes ?? []);
    } finally {
      definirBuscandoEndereco(false);
    }
  }

  function selecionarEndereco(sugestao) {
    definirCoordenadas({ latitude: sugestao.latitude, longitude: sugestao.longitude });
    definirSugestoesEndereco([]);
  }

  function alterarHorario(diaSemana, campo, valor) {
    definirHorarios((horariosAtuais) => horariosAtuais.map((horario) => horario.diaSemana === diaSemana ? { ...horario, [campo]: valor } : horario));
  }

  async function enviarFormulario(evento) {
    evento.preventDefault();
    if (salvando) return;
    definirSalvando(true);
    try {
      const resultado = await salvarFilial(
        evento,
        filial ? `/filiais/${filial.idUnidade}` : '/filiais',
        filial ? 'PATCH' : 'POST',
        { horarios, email, telefone, tipoDocumento: 'CNPJ', documento, ...(coordenadas ? coordenadas : {}) },
      );

      if (!filial && resultado) {
        definirCep(''); definirNumero(''); definirEmail(responsavel?.email ?? ''); definirTelefone(formatarTelefone(responsavel?.telefone)); definirDocumento(''); definirUsarDadosResponsavel(true); definirCoordenadas(null); definirHorarios(criarHorarios()); definirSugestoesEndereco([]);
      }
    } finally {
      definirSalvando(false);
    }
  }

  return <form className="formulario-salao formulario-salao--filial grade-formulario" onSubmit={enviarFormulario}>
    <section className="dados-contato-filial">
      <div className="dados-contato-filial__cabecalho"><div><strong>Contato e documento</strong><p>Defina os dados que os clientes verão ao acessar esta filial.</p></div></div>
      <div className="dados-contato-filial__campos">
        <label className="campo-formulario"><span>E-mail de atendimento</span><input autoComplete="email" disabled={usarDadosResponsavel} onChange={(evento) => definirEmail(evento.target.value)} required type="email" value={email} /></label>
        <label className="campo-formulario"><span>Telefone</span><input disabled={usarDadosResponsavel} inputMode="numeric" onChange={(evento) => definirTelefone(formatarTelefone(evento.target.value))} placeholder="(00) 00000-0000" required value={telefone} /></label>
        <label className="campo-formulario"><span>CNPJ da filial</span><input autoComplete="organization" onChange={(evento) => definirDocumento(formatarCnpj(evento.target.value))} placeholder="AA.AAA.AAA/AAAA-00" required value={documento} /></label>
      </div>
      <label className="campo-formulario--checkbox dados-contato-filial__checkbox"><input checked={usarDadosResponsavel} onChange={(evento) => copiarDadosResponsavel(evento.target.checked)} type="checkbox" /><span>Usar e-mail e telefone do responsável</span></label>
    </section>
    <label className="campo-formulario"><span>Nome da filial</span><input defaultValue={filial?.nome ?? ''} name="nome" required /></label>
    <label className="campo-formulario"><span>Categoria</span><select defaultValue={filial?.categoria ?? 'UNISSEX'} name="categoria"><option value="FEMININO">Feminino</option><option value="MASCULINO">Masculino</option><option value="UNISSEX">Unissex</option><option value="OUTRO">Outro</option></select></label>
    <label className="campo-formulario"><span>CEP</span><input autoComplete="postal-code" inputMode="numeric" maxLength="9" name="cep" onChange={alterarCep} placeholder="00000-000" required value={cep} /></label>
    <label className="campo-formulario"><span>Número</span><div className="campo-formulario__entrada-com-acao"><input name="numero" onChange={alterarNumero} required value={numero} /><button className="botao-secundario" disabled={buscandoEndereco} onClick={localizarEndereco} type="button">{buscandoEndereco ? 'Buscando...' : 'Localizar endereço'}</button></div></label>
    <label className="campo-formulario"><span>Complemento</span><input defaultValue={filial?.complemento ?? ''} name="complemento" /></label>
    <p className="endereco-preenchido">{buscandoCep ? 'Buscando endereço pelo CEP...' : endereco?.rua ? `${endereco.rua}, ${endereco.bairro} · ${endereco.municipio}/${endereco.estado}` : 'Informe o CEP para preencher o endereço automaticamente.'}</p>
    {sugestoesEndereco.length > 0 && <section className="sugestoes-endereco"><strong>Confirme o endereço encontrado</strong><p>Selecione a opção que corresponde à entrada da filial.</p>{sugestoesEndereco.map((sugestao) => <button key={sugestao.id} onClick={() => selecionarEndereco(sugestao)} type="button">{sugestao.endereco}</button>)}</section>}
    <section className="ajuste-localizacao"><div><strong>Localização da filial</strong><p>{coordenadas ? 'Localização definida pelo endereço selecionado.' : 'Informe o CEP, o número e selecione o endereço sugerido.'}</p></div><MapaAjusteFilial coordenadas={coordenadas} />{coordenadas && <small>Latitude {coordenadas.latitude.toFixed(6)} · Longitude {coordenadas.longitude.toFixed(6)}</small>}</section>
    <section className="horarios-filial"><div><strong>Horários de funcionamento</strong><p>Defina quando esta unidade recebe clientes.</p></div>{horarios.map((horario) => <div className="linha-horario" key={horario.diaSemana}><span>{diasSemana[horario.diaSemana]}</span><label><input checked={horario.fechado} onChange={(evento) => alterarHorario(horario.diaSemana, 'fechado', evento.target.checked)} type="checkbox" /> Fechado</label><input disabled={horario.fechado} onChange={(evento) => alterarHorario(horario.diaSemana, 'abertura', evento.target.value)} required={!horario.fechado} type="time" value={horario.abertura} /><span>até</span><input disabled={horario.fechado} onChange={(evento) => alterarHorario(horario.diaSemana, 'fechamento', evento.target.value)} required={!horario.fechado} type="time" value={horario.fechamento} /></div>)}</section>
    <button className="botao-enviar" disabled={salvando}>{salvando ? 'Salvando...' : filial ? 'Atualizar filial' : 'Criar filial'} <span>→</span></button>
  </form>;
}
