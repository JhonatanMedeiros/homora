// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ServiceInput } from '@homora/shared';
import { ServiceForm } from './service-form';
import { emptyService } from '@/lib/services';
import { chooseSelectOption } from '@/test-select';

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
      isPublic={false}
      onPublicChange={() => {}}
      onChange={onChange}
      onSubmit={(event) => event.preventDefault()}
      onCancel={() => {}}
    />,
  );
  return onChange;
}

it('allows selecting ping and interval, restoring default when empty', async () => {
  const onChange = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Opções avançadas' }));
  const method = screen.getByRole('combobox', { name: 'Método de verificação' });
  expect(method.textContent).toBe('Requisição HTTP');
  await chooseSelectOption('Método de verificação', 'Ping (ICMP)');
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ checkType: 'ping' }));

  const interval = screen.getByLabelText('Verificar a cada (segundos)') as HTMLInputElement;
  expect(interval.min).toBe('30');
  expect(interval.max).toBe('3600');
  fireEvent.change(interval, { target: { value: '120' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ checkInterval: 120 }));
});

it('warns that ping proves host reachability, not service health', () => {
  setup({ ...emptyService, checkType: 'ping', checkInterval: 45 });
  expect(screen.getByText(/não diz nada sobre o serviço/)).toBeTruthy();
  expect((screen.getByLabelText('Verificar a cada (segundos)') as HTMLInputElement).value).toBe(
    '45',
  );
});

it('keeps advanced options collapsed for a new service and open when values exist', () => {
  setup();
  expect(screen.queryByLabelText('Método de verificação')).toBeNull();
  expect(screen.getByLabelText('Nome')).toBeTruthy();
  cleanup();
  setup({ ...emptyService, description: 'Filmes' });
  expect(screen.getByLabelText('Método de verificação')).toBeTruthy();
});
