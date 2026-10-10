import './globals.css';
import RegistrarPwa from '../components/RegistrarPwa/RegistrarPwa';
import TelaManutencao from '../components/TelaManutencao/TelaManutencao';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AgendeAki',
  description: 'Encontre salões, escolha seu profissional e agende seu momento de cuidado.',
  applicationName: 'AgendeAki',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AgendeAki' },
  icons: { apple: '/icone-192.png' },
};

export const viewport = { themeColor: '#3f1d3b' };

export default function LayoutPrincipal({ children }) {
  const emManutencao = process.env.NEXT_PUBLIC_MANUTENCAO === 'true';

  return (
    <html lang="pt-BR">
      <body>
        {emManutencao ? <TelaManutencao /> : <><RegistrarPwa />{children}</>}
      </body>
    </html>
  );
}
