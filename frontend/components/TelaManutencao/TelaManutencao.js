export default function TelaManutencao() {
  return (
    <main className="manutencao" aria-labelledby="manutencao-titulo">
      <div className="manutencao__brilho manutencao__brilho--um" aria-hidden="true" />
      <div className="manutencao__brilho manutencao__brilho--dois" aria-hidden="true" />

      <section className="manutencao__conteudo">
        <div className="marca">
          <span className="marca__simbolo" aria-hidden="true">a</span>
          <span>agende<span>aki</span></span>
        </div>

        <div className="manutencao__ilustracao" aria-hidden="true">
          <div className="manutencao__orbita manutencao__orbita--externa" />
          <div className="manutencao__orbita manutencao__orbita--interna" />
          <div className="manutencao__engrenagem">✿</div>
          <span className="manutencao__estrela manutencao__estrela--um">✦</span>
          <span className="manutencao__estrela manutencao__estrela--dois">✧</span>
          <span className="manutencao__ponto manutencao__ponto--um" />
          <span className="manutencao__ponto manutencao__ponto--dois" />
        </div>

        <p className="manutencao__etiqueta"><span /> Estamos preparando novidades</p>
        <h1 id="manutencao-titulo">Um instante, estamos cuidando de tudo.</h1>
        <p className="manutencao__descricao">
          O AgendeAki está passando por uma manutenção. Em breve, você poderá voltar a encontrar seu próximo momento de cuidado.
        </p>
        <div className="manutencao__rodape">
          <span className="manutencao__linha" />
          <p>Obrigado pela compreensão</p>
          <span className="manutencao__linha" />
        </div>
      </section>
    </main>
  );
}
