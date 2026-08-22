import Link from 'next/link';

export default function BotaoNavegacao({ destino, destaque = false, texto }) {
  return (
    <Link
      className={`botao-navegacao ${destaque ? 'botao-navegacao--destaque' : 'botao-navegacao--secundario'}`}
      href={destino}
    >
      {texto}
      <span aria-hidden="true">→</span>
    </Link>
  );
}
