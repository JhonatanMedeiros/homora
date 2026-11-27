import { useBrowseState } from '@/features/dashboard/use-browse-state';
import { useViewPreferences } from '@/features/dashboard/use-view-preferences';
import { HealthPill } from '@/features/home/health-pill';
import { useHomeArea } from '@/features/home/use-home-area';
import type { useServices } from '@/hooks/use-services';

/**
 * The health pill on the pages outside the Home views, which bring their own: the top bar says how
 * things are wherever the person is.
 */
export function ShellHealth({
  data,
  navigate,
}: {
  data: ReturnType<typeof useServices>;
  navigate: (path: string) => void;
}) {
  const { uptimeRange } = useViewPreferences();
  // No filters apply here, so the counts cover everything.
  const browse = useBrowseState(data.activePageId);
  const { sources, model, health, actions } = useHomeArea(data, browse, uptimeRange);
  return (
    <HealthPill
      data={data}
      sources={sources}
      health={health}
      impacts={model.impacts}
      range={uptimeRange}
      onService={(id) => navigate(`/services/${id}`)}
      onProbes={() => navigate('/manage/probes')}
      onConnections={() => navigate('/manage/integrations')}
      onAcknowledge={(members, minutes) => void actions.acknowledge(members, minutes)}
    />
  );
}
