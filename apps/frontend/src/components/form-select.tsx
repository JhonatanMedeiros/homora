import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@homora/ui/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@homora/ui/select';

const OPTION_PREFIX = 'homora-option:';

function encodeOption(value: string | number) {
  return `${OPTION_PREFIX}${value}`;
}

type Props = {
  id?: string;
  className?: string;
  children: ReactNode;
  value: string | number;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  'aria-label'?: string;
  onChange: (event: { target: { value: string } }) => void;
};

/** Select control composed from the project's shadcn primitives. */
export function FormSelect({
  id,
  className,
  children,
  value,
  disabled,
  required,
  name,
  'aria-label': ariaLabel,
  onChange,
}: Props) {
  return (
    <Select
      name={name}
      required={required}
      disabled={disabled}
      value={encodeOption(value)}
      onValueChange={(itemValue) => {
        if (itemValue.startsWith(OPTION_PREFIX)) {
          onChange({ target: { value: itemValue.slice(OPTION_PREFIX.length) } });
        }
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn('h-10 w-full bg-card text-base pointer-coarse:h-11 md:text-sm', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>{children}</SelectGroup>
      </SelectContent>
    </Select>
  );
}

type FormSelectOptionProps = Omit<ComponentProps<typeof SelectItem>, 'value'> & {
  value: string | number;
};

/** Select option API that keeps raw HTML option elements out of product components. */
export function FormSelectOption({ value, ...props }: FormSelectOptionProps) {
  return <SelectItem value={encodeOption(value)} {...props} />;
}
