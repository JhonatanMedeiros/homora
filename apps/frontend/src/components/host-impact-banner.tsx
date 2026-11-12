import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { OfflineNode } from '@/lib/hosts';
import { t } from '@/i18n';

type Props = { nodes: OfflineNode[]; onSeeImpact: (node: OfflineNode) => void };

/** One line per offline node that has linked services. Never shown when the inventory is unreadable. */
export function HostImpactBanner({ nodes, onSeeImpact }: Props) {
  if (nodes.length === 0) return null;
  return (
    <div role="status" className="flex flex-col gap-2">
      {nodes.map((node) => (
        <Alert key={`${node.connectionId}:${node.node}`} variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {t('hosts.banner', { node: node.node, count: node.affected.length })}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 pointer-coarse:min-h-11"
              onClick={() => onSeeImpact(node)}
            >
              {t('hosts.banner.seeImpact')}
            </Button>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
