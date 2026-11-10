import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { useTopBar } from '@/hooks/use-top-bar';
import { PageHeader } from '@/components/page-header';
import { ConfigTransfer } from '@/features/transfer/config-transfer';
import { t } from '@/i18n';

export function SettingsPage({ onImported }: { onImported: () => void | Promise<void> }) {
  const [topBar, setTopBar] = useTopBar();
  return (
    <section aria-label={t('settings.title')} className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <Field orientation="horizontal" className="items-start">
        <Checkbox
          id="top-bar"
          checked={topBar}
          onCheckedChange={(checked) => setTopBar(checked === true)}
        />
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="top-bar">{t('settings.topBar')}</FieldLabel>
          <FieldDescription>{t('settings.topBarHint')}</FieldDescription>
        </div>
      </Field>
      <ConfigTransfer onImported={onImported} />
    </section>
  );
}
