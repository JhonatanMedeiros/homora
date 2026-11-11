import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildSnippet, CLIENTS, FOLDER_PLACEHOLDER, type ClientId } from './connect-snippets';
import { t } from '@/i18n';

const FOLDER_KEY = 'homora-agent-folder';
const CLIENT_KEY = 'homora-agent-client';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* kept for this session only */
  }
}

/** Setup instructions per MCP client. The token is filled in only right after it is created. */
export function ConnectGuide({ token }: { token?: string }) {
  const [client, setClient] = useState<ClientId>(() => {
    const saved = read(CLIENT_KEY);
    return CLIENTS.find((item) => item.id === saved)?.id ?? 'claude-code';
  });
  const [folder, setFolder] = useState(() => read(FOLDER_KEY) ?? '');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={client}
        onValueChange={(value) => {
          setClient(value as ClientId);
          write(CLIENT_KEY, value);
          setCopied(false);
        }}
      >
        <TabsList className="w-full justify-start overflow-x-auto" aria-label={t('guide.client')}>
          {CLIENTS.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className="flex-none">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {CLIENTS.map((item) => {
          const snippet = buildSnippet(item.id, { token, folder });
          return (
            <TabsContent key={item.id} value={item.id} className="flex flex-col gap-2">
              {snippet.file && (
                <p className="font-mono text-xs text-muted-foreground">
                  {t('guide.file', { file: snippet.file })}
                </p>
              )}
              <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                <code>{snippet.text}</code>
              </pre>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void copy(snippet.text)}
                >
                  {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                  {copied ? t('token.copied') : t('guide.copySnippet')}
                </Button>
                {copyFailed && (
                  <span role="status" className="text-xs text-destructive">
                    {t('agents.copyFailed')}
                  </span>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
      <Field>
        <FieldLabel htmlFor="homora-folder">{t('guide.folder')}</FieldLabel>
        <Input
          id="homora-folder"
          className="font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
          value={folder}
          placeholder={FOLDER_PLACEHOLDER}
          onChange={(event) => {
            setFolder(event.target.value);
            write(FOLDER_KEY, event.target.value);
            setCopied(false);
          }}
        />
        <FieldDescription>{t('guide.folderHint')}</FieldDescription>
      </Field>
      <p className="text-xs text-muted-foreground">{t('guide.database')}</p>
      {!token && <p className="text-xs text-muted-foreground">{t('guide.noToken')}</p>}
    </div>
  );
}
