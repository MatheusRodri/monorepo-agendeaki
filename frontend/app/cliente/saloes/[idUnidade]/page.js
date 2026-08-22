import ServicosSalao from '../../../../components/ServicosSalao/ServicosSalao';

export default async function PaginaServicosSalao({ params }) {
  const parametros = await params;
  return <ServicosSalao idUnidade={parametros.idUnidade} />;
}
