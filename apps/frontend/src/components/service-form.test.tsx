// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ServiceInput } from '@homora/shared';
import { ServiceForm } from './service-form';
import { emptyService } from '@/lib/services';

afterEach(cleanup);

function setup(value: ServiceInput = emptyService) {
  const onChange = vi.fn();
  render(
    <ServiceForm
      editing={false}
      value={value}
      categories={[]}
      error=""
      saving={false}
      nameRef={null}
      onChange={onChange}
      onSubmit={(event) => event.preventDefault()}
      onCancel={() => {}}
    />,
  );
  return onChange;
}

it('permite escolher ping e o intervalo, e volta ao padrão com o campo vazio', () => {
  const onChange = setup();
  const method = screen.getByLabelText('Método de verificação') as HTMLSelectElement;
  expect(method.value).toBe('http');
  fireEvent.change(method, { target: { value: 'ping' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ checkType: 'ping' }));

  const interval = screen.getByLabelText('Verificar a cada (segundos)') as HTMLInputElement;
  expect(interval.min).toBe('30');
  expect(interval.max).toBe('3600');
  fireEvent.change(interval, { target: { value: '120' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ checkInterval: 120 }));
});

it('avisa que o ping não diz nada sobre o serviço', () => {
  setup({ ...emptyService, checkType: 'ping', checkInterval: 45 });
  expect(screen.getByText(/não diz nada sobre o serviço/)).toBeTruthy();
  expect((screen.getByLabelText('Verificar a cada (segundos)') as HTMLInputElement).value).toBe(
    '45',
  );
});
