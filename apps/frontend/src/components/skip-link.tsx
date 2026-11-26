import { t } from '@/i18n';

/**
 * First tab stop of the page. On the Home it lands on the first service, past the header, the page
 * tabs, the rail and the toolbar; elsewhere on the main content.
 */
export function SkipLink({ home }: { home: boolean }) {
  return (
    <a
      href="#content"
      className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground outline-none focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        event.preventDefault();
        const main = document.querySelector<HTMLElement>('#content');
        const service = home
          ? main?.querySelector<HTMLElement>(
              '[data-homora="pinned"] a[href], [data-homora="service-card"] a[href]',
            )
          : null;
        (service ?? main)?.focus();
        (service ?? main)?.scrollIntoView?.({ block: 'center' });
      }}
    >
      {t(home ? 'skip.services' : 'skip.content')}
    </a>
  );
}
