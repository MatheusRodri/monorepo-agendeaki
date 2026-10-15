'use client';

import { useState } from 'react';
import { dataParaExibicao, dataParaIso, formatarCnpj, formatarCpf, formatarData, formatarTelefone } from '../../utils/formatadores';
import { requisitarApi } from '../../utils/api';
import { toastErro } from '../../utils/toast';

export default function ModalCompletarPerfil({ aoConcluir, cadastroIncompleto = true, dadosCadastrais, nomeSalao: nomeSalaoInicial = '', perfil, salaoIncompleto = false, rotaApi, tokenAcesso }) {
  const salao = rotaApi === 'salao';
  const [dados, definirDados] = useState({
    nome: dadosCadastrais?.nome ?? perfil?.nome ?? '',
    telefone: formatarTelefone(dadosCadastrais?.telefone ?? perfil?.telefone),
    cpf: formatarCpf(dadosCadastrais?.cpf),
    dataNascimento: dataParaExibicao(dadosCadastrais?.dataNascimento),
    documento: salao ? formatarCnpj(dadosCadastrais?.documento) : formatarCpf(dadosCadastrais?.documento),
    tipoDocumento: salao ? 'CNPJ' : 'CPF',
  });
  const [nomeSalao, definirNomeSalao] = useState(nomeSalaoInicial);
  const [enviando, definirEnviando] = useState(false);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    if (name === 'cpf') definirDados((atual) => ({ ...atual, cpf: formatarCpf(value) }));
    else if (name === 'documento') definirDados((atual) => ({ ...atual, documento: salao ? formatarCnpj(value) : formatarCpf(value) }));
    else if (name === 'dataNascimento') definirDados((atual) => ({ ...atual, dataNascimento: formatarData(value) }));
    else if (name === 'telefone') definirDados((atual) => ({ ...atual, telefone: formatarTelefone(value) }));
    else if (name === 'tipoDocumento') definirDados((atual) => ({ ...atual, tipoDocumento: value, documento: '' }));
    else definirDados((atual) => ({ ...atual, [name]: value }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    definirEnviando(true);
    try {
      if (cadastroIncompleto) {
        await requisitarApi(`/api/${salao ? 'salao' : 'clientes'}/perfil`, {
          dados: { ...dados, ...(salao ? { tipoDocumento: 'CNPJ' } : {}), dataNascimento: dataParaIso(dados.dataNascimento) },
          metodo: 'PATCH',
          tokenAcesso,
        });
      }
      if (salao && salaoIncompleto) {
        try {
          await requisitarApi('/api/salao/saloes', {
            dados: { nome: nomeSalao.trim() },
            metodo: 'POST',
            tokenAcesso,
          });
        } catch (erro) {
          if (erro.status !== 409) throw erro;
          await requisitarApi('/api/salao/saloes/atual', { tokenAcesso });
        }
      }
      aoConcluir();
    } catch (erro) {
      toastErro(erro.message);
    } finally {
      definirEnviando(false);
    }
  }

  const titulo = salaoIncompleto
    ? 'Vamos recuperar seu salão.'
    : 'Complete suas informações.';
  const descricao = salaoIncompleto
    ? 'Sua conta continua ativa. Confirme os dados que faltam para acessar novamente a área do salão.'
    : 'Precisamos destes dados antes de continuar.';

  return <div className="modal-conta" role="dialog" aria-modal="true" aria-labelledby="titulo-completar-perfil"><section>
    <p className="sobretitulo">Cadastro necessário</p>
    <h2 id="titulo-completar-perfil">{titulo}</h2>
    <p>{descricao}</p>
    <form className="grade-formulario" onSubmit={salvar}>
      {cadastroIncompleto && <>
        <label className="campo-formulario"><span>{salao ? 'Nome do responsável' : 'Seu nome'}</span><input autoComplete="name" name="nome" onChange={alterarCampo} required value={dados.nome} /></label>
        {salao && <label className="campo-formulario"><span>Telefone do responsável</span><input autoComplete="tel" inputMode="numeric" name="telefone" onChange={alterarCampo} placeholder="(00) 00000-0000" required value={dados.telefone} /></label>}
        <label className="campo-formulario"><span>Data de nascimento</span><input inputMode="numeric" maxLength="10" name="dataNascimento" onChange={alterarCampo} placeholder="DD/MM/AAAA" required value={dados.dataNascimento} /></label>
        {salao ? <>
          <label className="campo-formulario"><span>CNPJ da empresa</span><input autoComplete="organization" name="documento" onChange={alterarCampo} placeholder="AA.AAA.AAA/AAAA-00" required value={dados.documento} /></label>
        </> : <label className="campo-formulario"><span>CPF</span><input inputMode="numeric" name="cpf" onChange={alterarCampo} placeholder="000.000.000-00" required value={dados.cpf} /></label>}
      </>}
      {salao && salaoIncompleto && <label className="campo-formulario"><span>Nome do salão</span><input autoComplete="organization" maxLength="120" onChange={(evento) => definirNomeSalao(evento.target.value)} required value={nomeSalao} /></label>}
      <button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Salvando...' : salaoIncompleto ? 'Recuperar e continuar' : 'Salvar e continuar'} →</button>
    </form>
  </section></div>;
}
