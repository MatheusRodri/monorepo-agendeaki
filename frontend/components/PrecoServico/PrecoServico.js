const dinheiro = (valor) => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PrecoServico({ valor, valorOriginal, promocaoAtiva = false }) {
  return <span className="preco-servico">
    {promocaoAtiva && <><small className="preco-servico__selo">Promoção</small><del aria-label={`Preço original: ${dinheiro(valorOriginal)}`}>{dinheiro(valorOriginal)}</del></>}
    <span className="preco-servico__atual">{dinheiro(valor)}</span>
  </span>;
}
