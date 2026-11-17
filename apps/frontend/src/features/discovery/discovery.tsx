import { SectionTitle } from '@/components/section-title';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@homora/ui/tabs';
import { t } from '@/i18n';
import { LocalDiscovery } from './local-discovery';
import { PushSources } from './push-sources';

/**
 * Card suggestions from Docker container labels, from this host or from remote agents.
 * Nothing is added without review.
 */
export function Discovery({ onImported }: { onImported: () => void | Promise<void> }) {
  return (
    <section aria-labelledby="discovery-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SectionTitle id="discovery-title">{t('discovery.title')}</SectionTitle>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          {t('settings.discovery.pageHint')}
        </p>
      </div>
      <Tabs defaultValue="local">
        <TabsList>
          <TabsTrigger value="local">{t('settings.discovery.tabLocal')}</TabsTrigger>
          <TabsTrigger value="remote">{t('settings.discovery.tabRemote')}</TabsTrigger>
        </TabsList>
        <TabsContent value="local" className="flex flex-col gap-4 pt-2">
          <p className="max-w-[65ch] text-sm text-muted-foreground">{t('discovery.hint')}</p>
          <LocalDiscovery onImported={onImported} />
        </TabsContent>
        <TabsContent value="remote" className="flex flex-col gap-4 pt-2">
          <PushSources onImported={onImported} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
