import { forwardRef, type ComponentProps } from 'react';
import { Search } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { t } from '@/i18n';

/** Service search; Ctrl K or / focuses the field (shortcut handled by the page). */
export const SearchField = forwardRef<HTMLInputElement, ComponentProps<'input'>>(
  function SearchField(props, ref) {
    return (
      <InputGroup className="h-10 max-w-md bg-card">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={ref}
          type="search"
          className="text-ellipsis"
          aria-label={t('search.label')}
          placeholder={t('search.label')}
          autoComplete="off"
          enterKeyHint="go"
          {...props}
        />
        <InputGroupAddon align="inline-end" className="hidden md:flex">
          <Kbd>Ctrl K</Kbd>
        </InputGroupAddon>
      </InputGroup>
    );
  },
);
