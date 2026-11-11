import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { useI18n } from '@/i18n';

/** Credential input that starts obscured and allows toggling visibility. */
export function PasswordInput({ disabled, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();

  return (
    <InputGroup className="h-10 bg-card shadow-none pointer-coarse:h-11 dark:bg-card">
      <InputGroupInput {...props} disabled={disabled} type={visible ? 'text' : 'password'} />
      <InputGroupAddon align="inline-end" className="py-0 pr-1 has-[>button]:mr-0">
        <InputGroupButton
          size="icon-sm"
          className="size-9 pointer-coarse:size-11"
          disabled={disabled}
          aria-label={t(visible ? 'common.hideSecret' : 'common.showSecret')}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
