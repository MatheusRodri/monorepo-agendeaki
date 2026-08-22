import './globals.css';

export const metadata = {
  title: 'AgendeAki',
  description: 'Encontre salões, escolha seu profissional e agende seu momento de cuidado.',
};

export default function LayoutPrincipal({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
