'use client';

import { useEffect, useRef, useState } from 'react';
import MapaAjusteFilial from '../MapaAjusteFilial/MapaAjusteFilial';

const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

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

export default function FormularioFilial({ endereco, filial, buscarCep, salvarFilial }) {
  const [cep, definirCep] = useState(filial?.cep ?? '');
  const [numero, definirNumero] = useState(filial?.numero ?? '');
  const [coordenadas, definirCoordenadas] = useState(filial?.latitude != null && filial?.longitude != null ? { latitude: Number(filial.latitude), longitude: Number(filial.longitude) } : null);
  const [horarios, definirHorarios] = useState(criarHorarios(filial?.horarios));
  const temporizadorCep = useRef(null);

  useEffect(() => {
    definirCep(filial?.cep ?? '');
    definirNumero(filial?.numero ?? '');
    definirCoordenadas(filial?.latitude != null && filial?.longitude != null ? { latitude: Number(filial.latitude), longitude: Number(filial.longitude) } : null);
    definirHorarios(criarHorarios(filial?.horarios));
  }, [filial]);

  useEffect(() => () => {
    clearTimeout(temporizadorCep.current);
  }, []);

  function alterarCep(evento) {
    const novoCep = evento.target.value;
    definirCep(novoCep);
    clearTimeout(temporizadorCep.current);

    if (novoCep.replace(/\D/g, '').length !== 8) return;
    temporizadorCep.current = setTimeout(async () => {
      const enderecoEncontrado = await buscarCep(novoCep);
      if (enderecoEncontrado?.coordenadasAproximadas) definirCoordenadas(enderecoEncontrado.coordenadasAproximadas);
    }, 450);
  }

  function alterarNumero(evento) {
    definirNumero(evento.target.value);
  }

  function alterarHorario(diaSemana, campo, valor) {
    definirHorarios((horariosAtuais) => horariosAtuais.map((horario) => horario.diaSemana === diaSemana ? { ...horario, [campo]: valor } : horario));
  }

  async function enviarFormulario(evento) {
    const resultado = await salvarFilial(
      evento,
      filial ? `/filiais/${filial.idUnidade}` : '/filiais',
      filial ? 'PATCH' : 'POST',
      { horarios, ...(coordenadas ? coordenadas : {}) },
    );

    if (!filial && resultado) {
      definirCep(''); definirNumero(''); definirCoordenadas(null); definirHorarios(criarHorarios());
    }
  }

  return <form className="formulario-salao grade-formulario" onSubmit={enviarFormulario}>
    <label className="campo-formulario"><span>Nome da filial</span><input defaultValue={filial?.nome ?? ''} name="nome" required /></label>
    <label className="campo-formulario"><span>Categoria</span><select defaultValue={filial?.categoria ?? 'UNISSEX'} name="categoria"><option value="FEMININO">Feminino</option><option value="MASCULINO">Masculino</option><option value="UNISSEX">Unissex</option><option value="OUTRO">Outro</option></select></label>
    <label className="campo-formulario"><span>CEP</span><input name="cep" onChange={alterarCep} required value={cep} /></label>
    <label className="campo-formulario"><span>Número</span><input name="numero" onChange={alterarNumero} required value={numero} /></label>
    <label className="campo-formulario"><span>Complemento</span><input defaultValue={filial?.complemento ?? ''} name="complemento" /></label>
    <label className="campo-formulario"><span>Telefone</span><input defaultValue={filial?.telefone ?? ''} name="telefone" /></label>
    <p className="endereco-preenchido">{endereco?.rua ? `${endereco.rua}, ${endereco.bairro} · ${endereco.municipio}/${endereco.estado}` : 'Informe CEP e número para localizar a filial.'}</p>
    <section className="ajuste-localizacao"><div><strong>Localização da filial</strong><p>O mapa é posicionado automaticamente pelas coordenadas disponíveis para o CEP informado.</p></div><MapaAjusteFilial aoAlterarCoordenadas={definirCoordenadas} coordenadas={coordenadas} />{coordenadas && <small>Latitude {coordenadas.latitude.toFixed(6)} · Longitude {coordenadas.longitude.toFixed(6)}</small>}</section>
    <section className="horarios-filial"><div><strong>Horários de funcionamento</strong><p>Defina quando esta unidade recebe clientes.</p></div>{horarios.map((horario) => <div className="linha-horario" key={horario.diaSemana}><span>{diasSemana[horario.diaSemana]}</span><label><input checked={horario.fechado} onChange={(evento) => alterarHorario(horario.diaSemana, 'fechado', evento.target.checked)} type="checkbox" /> Fechado</label><input disabled={horario.fechado} onChange={(evento) => alterarHorario(horario.diaSemana, 'abertura', evento.target.value)} required={!horario.fechado} type="time" value={horario.abertura} /><span>até</span><input disabled={horario.fechado} onChange={(evento) => alterarHorario(horario.diaSemana, 'fechamento', evento.target.value)} required={!horario.fechado} type="time" value={horario.fechamento} /></div>)}</section>
    <button className="botao-enviar">{filial ? 'Atualizar filial' : 'Criar filial'} <span>→</span></button>
  </form>;
}
