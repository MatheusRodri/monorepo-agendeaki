const desenhos = {
  financeiro: <><ellipse cx="10" cy="6" rx="7" ry="3" /><path d="M3 6v5c0 1.7 3.1 3 7 3m-7-3v5c0 1.7 3.1 3 7 3m7-13v4m-4 1c4 0 8 1.3 8 3s-3.1 3-7 3-7-1.3-7-3m0 0v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
  dinheiro: <><circle cx="12" cy="12" r="9" /><path d="M12 6v12m3-9h-4.5a2.5 2.5 0 0 0 0 5h3a2.5 2.5 0 0 0 0-5M9 15h4.5" /></>,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-13 4h1m6 0h1m-8 4h1m6 0h1" /></>,
  estrela: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m12 6 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9L8.4 17l.7-4-2.9-2.8 4-.6Z" /></>,
  servicos: <><circle cx="5" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><path d="m7 7 14 14M7 17 21 3M12 12l-2 2" /></>,
  realizado: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  grade: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  mais: <path d="M12 4v16M4 12h16" />,
  desconto: <><path d="M3 3h8l10 10-8 8L3 11Z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  ajustes: <><path d="m14 2-9 12h6l-1 8 9-12h-6Z" /><path d="m4 4 2-2m12 20 2-2" /></>,
  presente: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z" /></>,
  percentual: <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="m5 21 14-18" /></>,
  cancelar: <><circle cx="12" cy="12" r="9" /><path d="m8 8 8 8m0-8-8 8" /></>,
  menos: <><circle cx="12" cy="12" r="9" /><path d="M7 12h10" /></>,
  pessoa: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2Z" /></>,
  unidade: <><path d="M4 21V3h12v18m0-12h4v12M2 21h20M8 7h1m3 0h1M8 11h1m3 0h1M8 15h1m3 0h1m-3 6v-3h3v3" /></>,
  filtro: <path d="M3 4h18l-7 8v8l-4-2v-6Z" />,
  baixar: <><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5" /></>,
  grafico: <><path d="M3 21h18M5 16v-5h3v5m3 0V7h3v9m3 0V3h3v13" /></>,
  lista: <><path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01" /></>,
  tendencia: <><path d="m3 17 6-6 4 4 8-10m-6 0h6v6" /></>,
  seta: <path d="M4 12h16m-6-6 6 6-6 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  ideia: <><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1.2 1-1 2-1 2H9s.2-1-1-2Z" /><path d="M12 1V0M3 5 1 4m20 1 2-1" /></>,
};

export default function IconeDashboard({ nome, className = '' }) {
  return <svg aria-hidden="true" className={`icone-dashboard ${className}`} fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{desenhos[nome] ?? desenhos.grafico}</svg>;
}
