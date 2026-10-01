import FluxoAgendamento from '../../../components/FluxoAgendamento/FluxoAgendamento';

export default async function PaginaAgendamentoPublico({ params }) {
  const { slugFilial, slugSalao } = await params;
  return <FluxoAgendamento slugFilial={slugFilial} slugSalao={slugSalao} />;
}
