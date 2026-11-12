import { fireEvent, screen } from '@testing-library/react';

/** Open a shadcn Select, choose an option with keyboard events, and return its menu labels. */
export async function chooseSelectOption(label: string, optionName: string | RegExp) {
  const trigger = screen.getByRole('combobox', { name: label });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const option = await screen.findByRole('option', { name: optionName });
  const options = (await screen.findAllByRole('option')).map(
    (item) => item.textContent?.trim() ?? '',
  );
  fireEvent.keyDown(option, { key: 'Enter' });
  return options;
}
