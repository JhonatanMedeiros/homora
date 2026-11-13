// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  const method = screen.getByRole('radiogroup', { name: 'Método de verificação' });
  expect(
    within(method)
      .getByRole('radio', { name: /HTTP\(S\)/ })
      .getAttribute('aria-checked'),
  ).toBe('true');
  fireEvent.click(within(method).getByRole('radio', { name: /Ping/ }));
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

it('shows only the fields a check type uses and clears the ones it does not', () => {
  const onChange = setup({
    ...emptyService,
    checkType: 'http',
    checkPath: '/health',
    expectedStatus: '200',
  });
  expect(screen.getByLabelText(/Caminho de verificação/)).toBeTruthy();
  expect(screen.queryByLabelText('Texto que deve estar na página')).toBeNull();
  const group = screen.getByRole('radiogroup', { name: 'Método de verificação' });
  fireEvent.click(within(group).getByRole('radio', { name: /TCP/ }));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      checkType: 'tcp',
      checkPath: null,
      expectedStatus: null,
      checkMatch: null,
    }),
  );
  fireEvent.click(within(group).getByRole('radio', { name: /Palavra-chave/ }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ checkType: 'keyword' }));
});

it('asks what a keyword or JSON check looks for, and reads the tiles with the arrow keys', () => {
  const onChange = setup({ ...emptyService, checkType: 'json', checkMatch: 'status=ok' });
  const match = screen.getByLabelText('Valor JSON esperado') as HTMLInputElement;
  expect(match.required).toBe(true);
  expect(match.value).toBe('status=ok');
  fireEvent.change(match, { target: { value: 'data.up=true' } });
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ checkMatch: 'data.up=true' }),
  );
  const group = screen.getByRole('radiogroup', { name: 'Método de verificação' });
  fireEvent.keyDown(group, { key: 'ArrowRight' });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ checkType: 'http' }));
});

it('chooses how the service opens, defaulting to a new tab', () => {
  const onChange = setup();
  expect(screen.getByRole('radio', { name: 'Nova aba' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('radio', { name: 'Mesma aba' }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ openTarget: 'same-tab' }));
});
