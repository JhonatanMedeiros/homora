import { t } from '@/i18n';
import { Button } from '@/components/ui/button';

const icons = ['🎬', '🏠', '☁️', '🔒', '🎵', '📚', '🖥️', '🌐', '📷', '⚙️'];

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={t('icon.suggestions')}>
      {icons.map((icon) => (
        <Button
          key={icon}
          type="button"
          variant={value === icon ? 'secondary' : 'outline'}
          size="icon"
          aria-label={t('icon.use', { icon })}
          aria-pressed={value === icon}
          onClick={() => onChange(icon)}
        >
          {icon}
        </Button>
      ))}
    </div>
  );
}
