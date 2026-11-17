import { Component, type ReactNode } from 'react';
import { Button } from '@homora/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { useI18n } from '@/i18n';

function Recovery() {
  const { t } = useI18n();
  return (
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-between">
          <BrandMark className="text-2xl" />
          <LocaleSwitcher />
        </div>
        <div role="alert" className="flex flex-col items-start gap-4">
          <h1 className="text-2xl">{t('error.unexpected')}</h1>
          <p className="text-muted-foreground">{t('error.recovery')}</p>
          <Button onClick={() => window.location.reload()}>{t('error.reload')}</Button>
        </div>
      </div>
    </main>
  );
}

/** Catches rendering failures throughout both the authenticated and public interfaces. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Recovery /> : this.props.children;
  }
}
