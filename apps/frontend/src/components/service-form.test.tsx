// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ServiceInput } from '@homora/shared';
import { ServiceForm } from './service-form';
import { emptyService } from '@/lib/services';

afterEach(cleanup);

const openSection = (name: string) =>
  fireEvent.mouseDown(screen.getByRole('tab', { name: new RegExp(name) }), { button: 0 });

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
  openSection('Monitoramento');
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
  openSection('Monitoramento');
  expect(screen.getByText(/não diz nada sobre o serviço/)).toBeTruthy();
  expect((screen.getByLabelText('Verificar a cada (segundos)') as HTMLInputElement).value).toBe(
    '45',
  );
});

it('keeps the essentials on top and opens the appearance section first', () => {
  setup();
  expect(screen.getByLabelText('Nome')).toBeTruthy();
  expect(screen.getByLabelText('URL')).toBeTruthy();
  expect(screen.getByLabelText('Categoria')).toBeTruthy();
  expect(screen.getByRole('tab', { name: /Aparência/ }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tab', { name: /Monitoramento/ }).getAttribute('aria-selected')).toBe(
    'false',
  );
});

it('summarises each section in one line, even while it is closed', () => {
  setup({
    ...emptyService,
    description: 'Filmes',
    icon: 'brand:jellyfin',
    checkType: 'tcp',
    checkInterval: 45,
    allowPrivate: true,
  });
  const tab = (name: RegExp) => screen.getByRole('tab', { name }).textContent;
  expect(tab(/Aparência/)).toContain('descrição · ícone');
  expect(tab(/Monitoramento/)).toContain('TCP · a cada 45 s');
  expect(tab(/Acesso/)).toContain('rede privada');
  cleanup();
  setup();
  expect(screen.getByRole('tab', { name: /Aparência/ }).textContent).toContain(
    'Nada além do básico',
  );
  // Without host or dependency data there is nothing to show under Connections.
  expect(screen.queryByRole('tab', { name: /Conexões/ })).toBeNull();
});

it('opens the section of a field that fails validation, so the message can be seen', () => {
  setup({ ...emptyService, checkType: 'keyword', checkMatch: null });
  expect(screen.getByRole('tab', { name: /Aparência/ }).getAttribute('aria-selected')).toBe('true');
  const match = screen.getByLabelText('Texto que deve estar na página');
  fireEvent.invalid(match);
  expect(screen.getByRole('tab', { name: /Monitoramento/ }).getAttribute('aria-selected')).toBe(
    'true',
  );
});

it('moves to the icon field from the icon tile', () => {
  setup({ ...emptyService, name: 'Jellyfin' });
  openSection('Acesso');
  fireEvent.click(screen.getByRole('button', { name: 'Trocar ícone' }));
  expect(screen.getByRole('tab', { name: /Aparência/ }).getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(document.getElementById('service-icon'));
});

it('shows only the fields a check type uses and clears the ones it does not', () => {
  const onChange = setup({
    ...emptyService,
    checkType: 'http',
    checkPath: '/health',
    expectedStatus: '200',
  });
  openSection('Monitoramento');
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
  openSection('Monitoramento');
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
