'use client';

import { useEffect, useRef, useState } from 'react';
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

export default function FormularioFilial({ endereco, filial, buscarCep, buscarCoordenadas, salvarFilial }) {
  const [cep, definirCep] = useState(formatarCep(filial?.cep));
  const [numero, definirNumero] = useState(filial?.numero ?? '');
  const [coordenadas, definirCoordenadas] = useState(filial?.latitude != null && filial?.longitude != null ? { latitude: Number(filial.latitude), longitude: Number(filial.longitude) } : null);
  const [horarios, definirHorarios] = useState(criarHorarios(filial?.horarios));
  const [sugestoesEndereco, definirSugestoesEndereco] = useState([]);
  const [buscandoCep, definirBuscandoCep] = useState(false);
  const [buscandoEndereco, definirBuscandoEndereco] = useState(false);
  const temporizadorCep = useRef(null);

  useEffect(() => {
    definirCep(formatarCep(filial?.cep));
    definirNumero(filial?.numero ?? '');
    definirCoordenadas(filial?.latitude != null && filial?.longitude != null ? { latitude: Number(filial.latitude), longitude: Number(filial.longitude) } : null);
    definirHorarios(criarHorarios(filial?.horarios));
    definirSugestoesEndereco([]);
  }, [filial]);

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
    const resultado = await salvarFilial(
      evento,
      filial ? `/filiais/${filial.idUnidade}` : '/filiais',
      filial ? 'PATCH' : 'POST',
      { horarios, ...(coordenadas ? coordenadas : {}) },
    );

    if (!filial && resultado) {
      definirCep(''); definirNumero(''); definirCoordenadas(null); definirHorarios(criarHorarios()); definirSugestoesEndereco([]);
    }
  }

  return <form className="formulario-salao grade-formulario" onSubmit={enviarFormulario}>
    <label className="campo-formulario"><span>Nome da filial</span><input defaultValue={filial?.nome ?? ''} name="nome" required /></label>
    <label className="campo-formulario"><span>Categoria</span><select defaultValue={filial?.categoria ?? 'UNISSEX'} name="categoria"><option value="FEMININO">Feminino</option><option value="MASCULINO">Masculino</option><option value="UNISSEX">Unissex</option><option value="OUTRO">Outro</option></select></label>
    <label className="campo-formulario"><span>CEP</span><input autoComplete="postal-code" inputMode="numeric" maxLength="9" name="cep" onChange={alterarCep} placeholder="00000-000" required value={cep} /></label>
    <label className="campo-formulario"><span>Número</span><div className="campo-formulario__entrada-com-acao"><input name="numero" onChange={alterarNumero} required value={numero} /><button className="botao-secundario" disabled={buscandoEndereco} onClick={localizarEndereco} type="button">{buscandoEndereco ? 'Buscando...' : 'Localizar endereço'}</button></div></label>
    <label className="campo-formulario"><span>Complemento</span><input defaultValue={filial?.complemento ?? ''} name="complemento" /></label>
    <label className="campo-formulario"><span>Telefone</span><input defaultValue={filial?.telefone ?? ''} name="telefone" /></label>
    <p className="endereco-preenchido">{buscandoCep ? 'Buscando endereço pelo CEP...' : endereco?.rua ? `${endereco.rua}, ${endereco.bairro} · ${endereco.municipio}/${endereco.estado}` : 'Informe o CEP para preencher o endereço automaticamente.'}</p>
    {sugestoesEndereco.length > 0 && <section className="sugestoes-endereco"><strong>Confirme o endereço encontrado</strong><p>Selecione a opção que corresponde à entrada da filial.</p>{sugestoesEndereco.map((sugestao) => <button key={sugestao.id} onClick={() => selecionarEndereco(sugestao)} type="button">{sugestao.endereco}</button>)}</section>}
    <section className="ajuste-localizacao"><div><strong>Localização da filial</strong><p>{coordenadas ? 'Localização confirmada pelo endereço selecionado.' : 'Informe o CEP, o número e selecione o endereço sugerido.'}</p></div><MapaAjusteFilial coordenadas={coordenadas} />{coordenadas && <small>Latitude {coordenadas.latitude.toFixed(6)} · Longitude {coordenadas.longitude.toFixed(6)}</small>}</section>
    <section className="horarios-filial"><div><strong>Horários de funcionamento</strong><p>Defina quando esta unidade recebe clientes.</p></div>{horarios.map((horario) => <div className="linha-horario" key={horario.diaSemana}><span>{diasSemana[horario.diaSemana]}</span><label><input checked={horario.fechado} onChange={(evento) => alterarHorario(horario.diaSemana, 'fechado', evento.target.checked)} type="checkbox" /> Fechado</label><input disabled={horario.fechado} onChange={(evento) => alterarHorario(horario.diaSemana, 'abertura', evento.target.value)} required={!horario.fechado} type="time" value={horario.abertura} /><span>até</span><input disabled={horario.fechado} onChange={(evento) => alterarHorario(horario.diaSemana, 'fechamento', evento.target.value)} required={!horario.fechado} type="time" value={horario.fechamento} /></div>)}</section>
    <button className="botao-enviar">{filial ? 'Atualizar filial' : 'Criar filial'} <span>→</span></button>
  </form>;
}
