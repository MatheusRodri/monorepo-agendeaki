'use client';

import { useCallback, useState } from 'react';
import { dataParaExibicao, dataParaIso, formatarCnpj, formatarData, formatarTelefone } from '../../utils/formatadores';
import { requisitarApi } from '../../utils/api';
import { toastErro } from '../../utils/toast';
import ModalDocumentoLegal from '../ModalDocumentoLegal/ModalDocumentoLegal';

export default function ModalCompletarPerfil({ aoConcluir, aceiteDocumentosPendente = false, cadastroIncompleto = true, dadosCadastrais, nomeSalao: nomeSalaoInicial = '', perfil, salaoIncompleto = false, rotaApi, tokenAcesso }) {
  const [aceitouDocumentos, definirAceitouDocumentos] = useState(false);
  const [documentoAberto, definirDocumentoAberto] = useState(null);
  const [documentosLegais, definirDocumentosLegais] = useState(null);
  const [carregandoDocumentos, definirCarregandoDocumentos] = useState(false);
  const [erroDocumentos, definirErroDocumentos] = useState('');
  const salao = rotaApi === 'salao';
  const [dados, definirDados] = useState({
    nome: dadosCadastrais?.nome ?? perfil?.nome ?? '',
    telefone: formatarTelefone(dadosCadastrais?.telefone ?? perfil?.telefone),
    dataNascimento: dataParaExibicao(dadosCadastrais?.dataNascimento),
    ...(salao ? { documento: formatarCnpj(dadosCadastrais?.documento) } : {}),
  });
  const [nomeSalao, definirNomeSalao] = useState(nomeSalaoInicial);
  const [enviando, definirEnviando] = useState(false);

  async function abrirDocumento(tipo) {
    definirDocumentoAberto(tipo);
    if (documentosLegais || carregandoDocumentos) return;
    definirCarregandoDocumentos(true);
    definirErroDocumentos('');
    try {
      definirDocumentosLegais(await requisitarApi('/api/documentos-legais'));
    } catch (erro) {
      definirErroDocumentos(erro.message);
    } finally {
      definirCarregandoDocumentos(false);
    }
  }

  const fecharDocumento = useCallback(() => definirDocumentoAberto(null), []);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    if (name === 'documento') definirDados((atual) => ({ ...atual, documento: formatarCnpj(value) }));
    else if (name === 'dataNascimento') definirDados((atual) => ({ ...atual, dataNascimento: formatarData(value) }));
    else if (name === 'telefone') definirDados((atual) => ({ ...atual, telefone: formatarTelefone(value) }));
    else definirDados((atual) => ({ ...atual, [name]: value }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    definirEnviando(true);
    try {
      if (cadastroIncompleto) {
        await requisitarApi(`/api/${salao ? 'salao' : 'clientes'}/perfil`, {
          dados: { ...dados, aceitouDocumentos, ...(salao ? { tipoDocumento: 'CNPJ' } : {}), dataNascimento: dataParaIso(dados.dataNascimento) },
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
        <label className="campo-formulario"><span>{salao ? 'Telefone do responsável' : 'Telefone'}</span><input autoComplete="tel" inputMode="numeric" name="telefone" onChange={alterarCampo} placeholder="(00) 00000-0000" required value={dados.telefone} /></label>
        <label className="campo-formulario"><span>Data de nascimento</span><input inputMode="numeric" maxLength="10" name="dataNascimento" onChange={alterarCampo} placeholder="DD/MM/AAAA" required value={dados.dataNascimento} /></label>
        {salao && <label className="campo-formulario"><span>CNPJ da empresa</span><input autoComplete="organization" name="documento" onChange={alterarCampo} placeholder="AA.AAA.AAA/AAAA-00" required value={dados.documento} /></label>}
      </>}
      {salao && salaoIncompleto && <label className="campo-formulario modal-conta__nome-salao"><span>Nome do salão</span><input autoComplete="organization" maxLength="120" onChange={(evento) => definirNomeSalao(evento.target.value)} required value={nomeSalao} /></label>}
      {aceiteDocumentosPendente && <label className="aceite-documentos"><input checked={aceitouDocumentos} onChange={(evento) => definirAceitouDocumentos(evento.target.checked)} required type="checkbox" /><span>Li e aceito os <button onClick={() => abrirDocumento('termosDeUso')} type="button">Termos de Uso</button> e a <button onClick={() => abrirDocumento('politicaPrivacidade')} type="button">Política de Privacidade</button>.</span></label>}
      <button className="botao-enviar" disabled={enviando} type="submit">{enviando ? 'Salvando...' : salaoIncompleto ? 'Recuperar e continuar' : 'Salvar e continuar'} →</button>
    </form>
  </section>{documentoAberto && <ModalDocumentoLegal aoFechar={fecharDocumento} carregando={carregandoDocumentos} documento={documentosLegais?.[documentoAberto]} erro={erroDocumentos} onRetry={() => abrirDocumento(documentoAberto)} tipo={documentoAberto} />}</div>;
}
