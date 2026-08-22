export default function CartaoInformacao({ descricao, icone, titulo }) {
  return (
    <article className="cartao-informacao">
      <span aria-hidden="true" className="cartao-informacao__icone">
        {icone}
      </span>
      <h3>{titulo}</h3>
      <p>{descricao}</p>
    </article>
  );
}
