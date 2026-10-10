export default function manifest() {
  return {
    name: 'AgendeAki',
    short_name: 'AgendeAki',
    description: 'Encontre salões, agende serviços e acompanhe seus horários.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fffaf8',
    theme_color: '#3f1d3b',
    lang: 'pt-BR',
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
}
