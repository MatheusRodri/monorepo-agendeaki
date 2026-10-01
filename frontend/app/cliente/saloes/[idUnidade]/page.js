import RedirecionamentoFilial from '../../../../components/RedirecionamentoFilial/RedirecionamentoFilial';

export default async function PaginaServicosSalao({ params }) {
  const parametros = await params;
  return <RedirecionamentoFilial idUnidade={parametros.idUnidade} />;
}
