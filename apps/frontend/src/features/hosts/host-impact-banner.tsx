import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { OfflineNode } from '@/features/hosts/hosts';
import { t } from '@/i18n';

type Props = {
  nodes: OfflineNode[];
  onSeeImpact: (node: OfflineNode) => void;
  /** Services that may also break through manual dependencies (clearly secondary). */
  indirect?: (node: OfflineNode) => number;
  /** How many pages the affected services are on; shown when more than one. */
  pageCount?: (node: OfflineNode) => number;
};

/** One line per offline node that has linked services. Never shown when the inventory is unreadable. */
export function HostImpactBanner({ nodes, onSeeImpact, indirect, pageCount }: Props) {
  if (nodes.length === 0) return null;
  return (
    <div role="status" data-homora="impact-banner" className="flex flex-col gap-2">
      {nodes.map((node) => (
        <Alert key={`${node.connectionId}:${node.node}`} variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {t('hosts.banner', { node: node.node, count: node.affected.length })}
            {indirect && indirect(node) > 0 && (
              <span className="text-muted-foreground">
                {t('hosts.banner.indirect', { count: indirect(node) })}
              </span>
            )}
            {pageCount && pageCount(node) > 1 && (
              <span className="text-muted-foreground">
                {t('pages.impact', { count: pageCount(node) })}
              </span>
            )}
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
