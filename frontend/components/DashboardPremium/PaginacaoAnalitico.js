'use client';

export default function PaginacaoAnalitico({ resultado, aoMudarPagina, aoMudarQuantidade }) {
  const { pagina, porPagina, total, totalPaginas } = resultado;
  const inicio = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, indice) => inicio + indice);
  const primeiraLinha = total ? (pagina - 1) * porPagina + 1 : 0;
  const ultimaLinha = Math.min(pagina * porPagina, total);
  return <nav aria-label="Paginação do analítico" className="analitico-paginacao">
    <span role="status">{total ? `${primeiraLinha}–${ultimaLinha} de ${total} registros` : '0 registros'}<span className="analitico-paginacao__total"> · Página {pagina} de {totalPaginas}</span></span>
    <div className="analitico-paginacao__controles">
      <label className="analitico-paginacao__quantidade"><select aria-label="Registros por página, rodapé" onChange={(evento) => aoMudarQuantidade(Number(evento.target.value))} value={porPagina}>{[25, 50, 100].map((valor) => <option key={valor} value={valor}>{valor}</option>)}</select><span>por página</span></label>
      <div className="analitico-paginacao__paginas">
        <button aria-label="Página anterior" disabled={pagina <= 1} onClick={() => aoMudarPagina(pagina - 1)} type="button">‹</button>
        {inicio > 1 && <><button aria-label="Página 1" onClick={() => aoMudarPagina(1)} type="button">1</button>{inicio > 2 && <span aria-hidden="true">…</span>}</>}
        {paginas.map((numero) => <button aria-current={pagina === numero ? 'page' : undefined} aria-label={`Página ${numero}`} key={numero} onClick={() => { if (pagina !== numero) aoMudarPagina(numero); }} type="button">{numero}</button>)}
        {paginas.at(-1) < totalPaginas && <>{paginas.at(-1) < totalPaginas - 1 && <span aria-hidden="true">…</span>}<button aria-label={`Página ${totalPaginas}`} onClick={() => aoMudarPagina(totalPaginas)} type="button">{totalPaginas}</button></>}
        <button aria-label="Próxima página" disabled={pagina >= totalPaginas} onClick={() => aoMudarPagina(pagina + 1)} type="button">›</button>
      </div>
    </div>
  </nav>;
}
