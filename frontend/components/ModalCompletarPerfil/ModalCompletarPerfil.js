'use client';

import { useState } from 'react';
import { dataParaExibicao, dataParaIso, formatarCnpj, formatarCpf, formatarData } from '../../utils/formatadores';
import { requisitarApi } from '../../utils/api';

export default function ModalCompletarPerfil({ aoConcluir, perfil, rotaApi, tokenAcesso }) {
  const [dados, definirDados] = useState({
    nome: perfil?.nome ?? '', cpf: formatarCpf(perfil?.cpf), dataNascimento: dataParaExibicao(perfil?.dataNascimento), documento: perfil?.tipoDocumento === 'CNPJ' ? formatarCnpj(perfil?.documento) : formatarCpf(perfil?.documento), tipoDocumento: perfil?.tipoDocumento ?? 'CPF',
  });
  const [mensagem, definirMensagem] = useState('');
  const [enviando, definirEnviando] = useState(false);
  const salao = rotaApi === 'salao';

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    if (name === 'cpf') definirDados((atual) => ({ ...atual, cpf: formatarCpf(value) }));
    else if (name === 'documento') definirDados((atual) => ({ ...atual, documento: atual.tipoDocumento === 'CNPJ' ? formatarCnpj(value) : formatarCpf(value) }));
    else if (name === 'dataNascimento') definirDados((atual) => ({ ...atual, dataNascimento: formatarData(value) }));
    else if (name === 'tipoDocumento') definirDados((atual) => ({ ...atual, tipoDocumento: value, documento: '' }));
    else definirDados((atual) => ({ ...atual, [name]: value }));
  }

  async function salvar(evento) {
    evento.preventDefault(); definirMensagem(''); definirEnviando(true);
    try {
      const respostaDados = await requisitarApi(`/api/${salao ? 'salao' : 'clientes'}/perfil`, { dados: { ...dados, dataNascimento: dataParaIso(dados.dataNascimento) }, metodo: 'PATCH', tokenAcesso });
      aoConcluir(respostaDados.perfil);
    } catch (erro) { definirMensagem(erro.message); } finally { definirEnviando(false); }
  }

  return <div className="modal-conta" role="dialog" aria-modal="true" aria-labelledby="titulo-completar-perfil"><section><p className="sobretitulo">Cadastro necessário</p><h2 id="titulo-completar-perfil">Complete suas informações.</h2><p>Precisamos destes dados antes de continuar.</p><form className="grade-formulario" onSubmit={salvar}><label className="campo-formulario"><span>{salao ? 'Nome do responsável' : 'Seu nome'}</span><input name="nome" onChange={alterarCampo} required value={dados.nome} /></label><label className="campo-formulario"><span>Data de nascimento</span><input inputMode="numeric" maxLength="10" name="dataNascimento" onChange={alterarCampo} placeholder="DD/MM/AAAA" required value={dados.dataNascimento} /></label>{salao ? <><label className="campo-formulario"><span>Documento</span><select name="tipoDocumento" onChange={alterarCampo} value={dados.tipoDocumento}><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option></select></label><label className="campo-formulario"><span>Número do {dados.tipoDocumento}</span><input inputMode="numeric" name="documento" onChange={alterarCampo} placeholder={dados.tipoDocumento === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'} required value={dados.documento} /></label></> : <label className="campo-formulario"><span>CPF</span><input inputMode="numeric" name="cpf" onChange={alterarCampo} placeholder="000.000.000-00" required value={dados.cpf} /></label>}{mensagem && <p className="mensagem-formulario mensagem-formulario--erro">{mensagem}</p>}<button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Salvando...' : 'Salvar e continuar'} →</button></form></section></div>;
}
