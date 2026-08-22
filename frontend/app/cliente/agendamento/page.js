import { Suspense } from 'react';
import FormularioAgendamento from '../../../components/FormularioAgendamento/FormularioAgendamento';

export default function PaginaAgendamento() {
  return (
    <Suspense fallback={<main />}>
      <FormularioAgendamento />
    </Suspense>
  );
}
