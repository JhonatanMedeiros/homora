import { Spinner } from '@/components/ui/spinner';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { isWriteScope, PROFILES, scopeLabel, SCOPES, type Profile } from './agent-model';
import { SHEET_CLASS } from './sheet-class';
import { t, type MessageKey } from '@/i18n';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves true when the agent was created (the token dialog takes over). */
  onCreate: (name: string, scopes: string[]) => Promise<boolean>;
};

const PROFILE_OPTIONS: { id: Profile; label: MessageKey; hint: MessageKey }[] = [
  { id: 'read', label: 'profile.read', hint: 'profile.read.hint' },
  { id: 'suggest', label: 'profile.suggest', hint: 'profile.suggest.hint' },
  { id: 'custom', label: 'profile.custom', hint: 'profile.custom.hint' },
];

/** Step 1 of creating an agent: a name and what it can do. */
export function NewAgentDialog({ open, onOpenChange, onCreate }: Props) {
  const [name, setName] = useState('');
  const [profile, setProfile] = useState<Profile>('suggest');
  const [custom, setCustom] = useState<string[]>([...PROFILES.suggest]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const scopes = profile === 'custom' ? custom : [...PROFILES[profile]];

  function choose(next: Profile) {
    // Custom starts from what was selected, so switching never loses the choice.
    if (next === 'custom') setCustom(scopes);
    setProfile(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFailed(false);
    const created = await onCreate(name.trim(), scopes);
    setSaving(false);
    if (created) {
      setName('');
      setProfile('suggest');
      setCustom([...PROFILES.suggest]);
    } else setFailed(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={SHEET_CLASS}>
        <DialogHeader>
          <DialogTitle>{t('agents.newAgent')}</DialogTitle>
          <DialogDescription>{t('agents.newAgentHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="agent-name">{t('agents.agentName')}</FieldLabel>
              <Input
                id="agent-name"
                required
                autoFocus
                maxLength={60}
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('agents.agentNamePlaceholder')}
              />
            </Field>
            <FieldSet>
              <FieldLegend variant="label">{t('agents.profile')}</FieldLegend>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={2}
                value={profile}
                aria-label={t('agents.profile')}
                onValueChange={(value) => {
                  const option = PROFILE_OPTIONS.find((item) => item.id === value);
                  if (option) choose(option.id);
                }}
                className="grid w-full grid-cols-1 sm:grid-cols-3"
              >
                {PROFILE_OPTIONS.map((option) => (
                  <ToggleGroupItem
                    key={option.id}
                    value={option.id}
                    className="h-auto min-h-16 w-full max-w-none flex-col items-start gap-0.5 p-3 text-left text-sm whitespace-normal"
                  >
                    <span className="font-medium">{t(option.label)}</span>
                    <span className="text-xs text-muted-foreground">{t(option.hint)}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldSet>
            {profile === 'custom' ? (
              <FieldSet>
                <FieldLegend variant="label">{t('agents.canDo')}</FieldLegend>
                <FieldGroup className="gap-3">
                  {SCOPES.map((scope) => (
                    <Field key={scope.id} orientation="horizontal" className="items-start">
                      <Checkbox
                        id={`scope-${scope.id}`}
                        checked={custom.includes(scope.id)}
                        onCheckedChange={(checked) =>
                          setCustom((current) =>
                            checked === true
                              ? [...new Set([...current, scope.id])]
                              : current.filter((item) => item !== scope.id),
                          )
                        }
                      />
                      <div className="flex flex-col gap-1">
                        <FieldLabel htmlFor={`scope-${scope.id}`}>{t(scope.label)}</FieldLabel>
                        <FieldDescription>{t(scope.hint)}</FieldDescription>
                      </div>
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t('agents.canDo')}</span>
                <ul className="flex flex-wrap gap-1.5" aria-label={t('agents.canDo')}>
                  {scopes.map((scope) => (
                    <li key={scope}>
                      <Badge variant={isWriteScope(scope) ? 'default' : 'secondary'}>
                        {scopeLabel(scope)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-muted-foreground">{t('agents.approvalNote')}</p>
            {failed && (
              <p role="alert" className="text-sm text-destructive">
                {t('agents.createFailed')}
              </p>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || scopes.length === 0}>
              {saving && <Spinner data-icon="inline-start" />}
              {t('agents.createAgent')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
