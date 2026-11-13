import { t } from '@/i18n';

/**
 * Shown while the session is being checked. It stays blank for a moment on purpose: someone who
 * is already signed in should never see the sign-in page flash before the app appears.
 */
export function AuthLoading() {
  return (
    <main role="status" className="grid min-h-svh place-items-center bg-background">
      <span className="sr-only">{t('auth.connecting')}</span>
      <span
        aria-hidden="true"
        className="auth-loading size-5 rounded-full border-2 border-muted border-t-primary"
      />
    </main>
  );
}
