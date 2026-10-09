import './globals.css';
import RegistrarPwa from '../components/RegistrarPwa/RegistrarPwa';

export const metadata = {
  title: 'AgendeAki',
  description: 'Encontre salões, escolha seu profissional e agende seu momento de cuidado.',
  applicationName: 'AgendeAki',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AgendeAki' },
  icons: { apple: '/icone-192.png' },
};

export const viewport = { themeColor: '#3f1d3b' };

export default function LayoutPrincipal({ children }) {
  return (
    <html lang="pt-BR">
      <body><RegistrarPwa />{children}</body>
    </html>
  );
}
