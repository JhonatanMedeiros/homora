import { forwardRef, type ComponentProps } from 'react';
import { Search } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';

/** Busca de serviços; Ctrl K ou / focam o campo (atalho tratado pela página). */
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
          aria-label="Buscar serviço"
          placeholder="Buscar serviço"
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
