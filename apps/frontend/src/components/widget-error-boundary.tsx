import { Component, type ReactNode } from 'react';
import { t } from '@/i18n';

/** A broken presentation must not unmount the dashboard or its other widgets. */
export class WidgetErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="status" className="text-sm text-muted-foreground">
        {t('cardWidget.error')}
      </p>
    ) : (
      this.props.children
    );
  }
}
