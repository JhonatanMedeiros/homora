import { DEFAULT_MONITOR_SETTINGS, type ServiceInput } from '@homora/shared';
import type { FormMonitoring } from '@/components/service-form-monitoring';
import { t } from '@/i18n';

export type Section = 'look' | 'monitoring' | 'links' | 'access';

type Context = {
  value: ServiceInput;
  isPublic: boolean;
  monitoring?: FormMonitoring;
  tags?: { value: string[] };
  host?: unknown;
  dependencies?: number;
};

/** Whether the alert thresholds differ from what a new service gets. */
export const alertsChanged = (monitoring?: FormMonitoring) =>
  Boolean(
    monitoring &&
    (monitoring.value.failureThreshold !== DEFAULT_MONITOR_SETTINGS.failureThreshold ||
      monitoring.value.recoveryThreshold !== DEFAULT_MONITOR_SETTINGS.recoveryThreshold ||
      monitoring.value.degradedLatencyMs !== DEFAULT_MONITOR_SETTINGS.degradedLatencyMs),
  );

/** One line that says what a section holds, so a closed section is still informative. */
export function sectionSummary(section: Section, context: Context): string {
  const { value } = context;
  if (section === 'look') {
    const parts = [
      value.description ? t('form.summary.description') : null,
      value.icon ? t('form.summary.icon') : null,
      context.tags && context.tags.value.length > 0
        ? t('form.summary.tags', { count: context.tags.value.length })
        : null,
      value.openTarget === 'same-tab' ? t('form.summary.sameTab') : null,
    ].filter(Boolean);
    return parts.join(' · ') || t('form.summary.nothing');
  }
  if (section === 'monitoring') {
    const parts = [
      t(`check.type.${value.checkType ?? 'http'}`),
      value.checkInterval
        ? t('form.summary.every', { seconds: value.checkInterval })
        : t('form.summary.defaultInterval'),
      alertsChanged(context.monitoring) ? t('form.summary.alerts') : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }
  if (section === 'links') {
    const parts = [
      context.host ? t('form.summary.host') : null,
      context.dependencies ? t('form.summary.deps', { count: context.dependencies }) : null,
    ].filter(Boolean);
    return parts.join(' · ') || t('form.summary.none');
  }
  const parts = [
    value.allowPrivate ? t('form.summary.private') : null,
    context.isPublic ? t('form.summary.public') : null,
  ].filter(Boolean);
  return parts.join(' · ') || t('form.summary.default');
}
