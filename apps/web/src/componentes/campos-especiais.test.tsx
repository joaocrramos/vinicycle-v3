import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CampoDocumento, CampoNumero } from './campos-especiais';

function Numero({ casas }: { casas: number }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <>
      <CampoNumero aria-label="valor" casas={casas} unidade="L" valor={v} aoMudar={setV} />
      <output>{v ?? 'nulo'}</output>
    </>
  );
}

describe('CampoNumero (P3)', () => {
  it('preenche da direita para a esquerda e grava sem ponto flutuante', async () => {
    render(<Numero casas={2} />);
    await userEvent.type(screen.getByLabelText('valor'), '123456');
    expect(screen.getByLabelText('valor')).toHaveValue('1.234,56');
    expect(screen.getByRole('status')).toHaveTextContent('1234.56');
  });
  it('apagar tudo volta a vazio', async () => {
    render(<Numero casas={4} />);
    const campo = screen.getByLabelText('valor');
    await userEvent.type(campo, '9950');
    expect(campo).toHaveValue('0,9950');
    await userEvent.clear(campo);
    expect(screen.getByRole('status')).toHaveTextContent('nulo');
  });
});

describe('CampoDocumento (P2)', () => {
  it('aplica a máscara do CNPJ alfanumérico', async () => {
    function C() {
      const [v, setV] = useState('');
      return <CampoDocumento aria-label="doc" tipo="cnpj" valor={v} aoMudar={setV} />;
    }
    render(<C />);
    await userEvent.type(screen.getByLabelText('doc'), '12abc34501de35');
    expect(screen.getByLabelText('doc')).toHaveValue('12.ABC.345/01DE-35');
  });
});
