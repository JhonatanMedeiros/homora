import type { ReactNode } from 'react';
import type { ServiceInput } from '@homora/shared';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DependencyPicker } from '@/features/hosts/dependency-picker';
import { HostPicker } from '@/features/hosts/host-picker';
import { LookPanel } from '@/components/service-form-look';
import { MonitoringPanel, type FormMonitoring } from '@/components/service-form-monitoring';
import { sectionSummary, type Section } from '@/components/service-form-summary';
import { useIsMobile } from '@/hooks/use-mobile';
import type { FormDependencies, FormHosts } from '@/components/service-form';
import { t } from '@/i18n';

export type SectionsProps = {
  value: ServiceInput;
  onChange: (value: ServiceInput) => void;
  isPublic: boolean;
  onPublicChange: (value: boolean) => void;
  monitoring?: FormMonitoring;
  tags?: { value: string[]; onChange: (tags: string[]) => void };
  hosts?: FormHosts;
  dependencies?: FormDependencies;
  /** The section to show, controlled so the form can reveal one (an invalid field, the icon). */
  open: Section | '';
  onOpenChange: (section: Section | '') => void;
};

const TITLES: Record<
  Section,
  'form.section.look' | 'form.section.monitoring' | 'form.section.links' | 'form.section.access'
> = {
  look: 'form.section.look',
  monitoring: 'form.section.monitoring',
  links: 'form.section.links',
  access: 'form.section.access',
};

/** The optional parts of a service: tabs on a wide screen, one-open-at-a-time sections on a phone. */
export function ServiceFormSections(props: SectionsProps) {
  const { value, onChange, isPublic, onPublicChange, monitoring, tags, hosts, dependencies } =
    props;
  const mobile = useIsMobile();
  const sections: Section[] = [
    'look',
    'monitoring',
    ...(hosts || dependencies ? (['links'] as const) : []),
    'access',
  ];
  const current = props.open || 'look';
  const summary = (section: Section) =>
    sectionSummary(section, {
      value,
      isPublic,
      monitoring,
      tags,
      host: hosts?.value,
      dependencies: dependencies?.value.length,
    });
  const panel = (section: Section): ReactNode => (
    <div data-section={section} hidden={mobile && props.open !== section}>
      {section === 'look' && <LookPanel value={value} onChange={onChange} tags={tags} />}
      {section === 'monitoring' && (
        <MonitoringPanel value={value} onChange={onChange} monitoring={monitoring} />
      )}
      {section === 'links' && (
        <FieldGroup className="gap-4">
          {hosts && <HostPicker {...hosts} />}
          {dependencies && <DependencyPicker {...dependencies} />}
        </FieldGroup>
      )}
      {section === 'access' && (
        <FieldGroup className="gap-3">
          <Field orientation="horizontal" className="items-start rounded-lg border p-3">
            <Checkbox
              id="service-private"
              checked={value.allowPrivate === true}
              onCheckedChange={(checked) =>
                onChange({
                  ...value,
                  allowPrivate: checked === true,
                  ...(checked === true ? {} : { checkInsecure: false }),
                })
              }
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="service-private">{t('form.allowPrivate')}</FieldLabel>
              <FieldDescription>{t('form.allowPrivateHint')}</FieldDescription>
            </div>
          </Field>
          <Field orientation="horizontal" className="items-start rounded-lg border p-3">
            <Checkbox
              id="service-insecure-tls"
              disabled={!value.allowPrivate}
              checked={value.checkInsecure === true}
              onCheckedChange={(checked) => onChange({ ...value, checkInsecure: checked === true })}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="service-insecure-tls">{t('form.insecureTls')}</FieldLabel>
              <FieldDescription>{t('form.insecureTlsHint')}</FieldDescription>
            </div>
          </Field>
          <Field orientation="horizontal" className="items-start rounded-lg border p-3">
            <Checkbox
              id="service-public"
              checked={isPublic}
              onCheckedChange={(checked) => onPublicChange(checked === true)}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="service-public">{t('form.public')}</FieldLabel>
              <FieldDescription>{t('form.publicHint')}</FieldDescription>
            </div>
          </Field>
        </FieldGroup>
      )}
    </div>
  );

  if (mobile)
    return (
      <Accordion
        type="single"
        collapsible
        value={props.open}
        onValueChange={(next) => props.onOpenChange(next as Section | '')}
        aria-label={t('form.sections')}
        className="border-t"
      >
        {sections.map((section) => (
          <AccordionItem key={section} value={section}>
            <AccordionTrigger className="items-center">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>{t(TITLES[section])}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {summary(section)}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent forceMount>{panel(section)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );

  return (
    <Tabs
      value={current}
      onValueChange={(next) => props.onOpenChange(next as Section)}
      className="gap-4 border-t pt-2"
    >
      <TabsList
        variant="line"
        aria-label={t('form.sections')}
        className="grid w-full grid-cols-[repeat(auto-fit,minmax(0,1fr))] items-stretch group-data-[orientation=horizontal]/tabs:h-auto"
      >
        {sections.map((section) => (
          <TabsTrigger
            key={section}
            value={section}
            className="h-auto flex-col items-start gap-0.5 py-2 text-left"
          >
            <span>{t(TITLES[section])}</span>
            <span className="w-full truncate text-xs font-normal text-muted-foreground">
              {summary(section)}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {sections.map((section) => (
        <TabsContent
          key={section}
          value={section}
          forceMount
          className="min-h-56 pt-4 data-[state=inactive]:hidden"
        >
          {panel(section)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
