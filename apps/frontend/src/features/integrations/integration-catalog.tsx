import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConnectionMark } from '@/features/connections/connection-mark';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { SectionTitle } from '@/components/section-title';
import { Spinner } from '@/components/ui/spinner';

type Entry = { type: string; label: string; capabilities: string[] };

function isEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.type === 'string' &&
    typeof entry.label === 'string' &&
    Array.isArray(entry.capabilities) &&
    entry.capabilities.every((item: unknown) => typeof item === 'string')
  );
}

export function IntegrationCatalog() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/integrations/catalog', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isEntry)) throw new Error();
        if (!controller.signal.aborted) setEntries(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <section aria-labelledby="catalog-title">
      <Card>
        <CardHeader>
          <SectionTitle id="catalog-title">Integrações disponíveis</SectionTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <>
              <Alert variant="destructive">
                <AlertDescription>Não foi possível carregar o catálogo.</AlertDescription>
              </Alert>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError(false);
                    setEntries(null);
                    setAttempt((value) => value + 1);
                  }}
                >
                  Tentar novamente
                </Button>
              </div>
            </>
          ) : entries === null ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Carregando integrações...
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma integração disponível.</p>
          ) : (
            <ItemGroup>
              {entries.map((entry) => (
                <Item key={entry.type} size="sm" className="px-0">
                  <ConnectionMark type={entry.type} />
                  <ItemContent>
                    <ItemTitle>{entry.label}</ItemTitle>
                    {entry.capabilities.length > 0 && (
                      <ItemDescription>{entry.capabilities.join(', ')}</ItemDescription>
                    )}
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
