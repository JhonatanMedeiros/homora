import { useEffect, useState } from 'react';

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
    <article className="widget integration-placeholder">
      <div className="widget-head">
        <span>◈ &nbsp; INTEGRAÇÕES</span>
        <span>CATÁLOGO</span>
      </div>
      <h3>Integrações disponíveis</h3>
      {error ? (
        <>
          <p role="alert">Não foi possível carregar o catálogo.</p>
          <button
            type="button"
            className="cancel"
            onClick={() => {
              setError(false);
              setEntries(null);
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </>
      ) : entries === null ? (
        <p role="status">Carregando integrações...</p>
      ) : entries.length === 0 ? (
        <p>Nenhuma integração disponível.</p>
      ) : (
        <ul className="integration-catalog">
          {entries.map((entry) => (
            <li key={entry.type}>{entry.label}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
