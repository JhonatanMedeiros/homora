import { definePresentation, type WidgetStat } from '../../frontend.js';
import { parseSummary, type OmadaDeviceGroup } from './contracts.js';

/** An unavailable section is shown as the dash, never as zero. */
export function createOmadaPresentation(t: (key: string) => string) {
  const dash = () => '—';
  return definePresentation({
    placeholderCount: 6,
    stats(value): WidgetStat[] | null {
      const data = parseSummary(value);
      if (!data) return null;
      const stats: WidgetStat[] = [
        { label: t('omada.clients'), value: data.clients ? String(data.clients.total) : dash() },
        {
          label: t('omada.wirelessWired'),
          value: data.clients ? `${data.clients.wireless} / ${data.clients.wired}` : dash(),
        },
      ];
      if (!data.clients && data.unavailable.clients !== 'failed')
        stats.push({
          label: t('omada.clientHistory'),
          value: t(
            data.unavailable.clients === 'collection-disabled'
              ? 'omada.collectionDisabled'
              : 'omada.collectionUnknown',
          ),
        });
      const devices = data.devices;
      const missing = data.unavailable.devices === 'incomplete' ? t('omada.incomplete') : dash();
      const group = (key: 'ap' | 'switch' | 'gateway', label: string): WidgetStat => {
        const g: OmadaDeviceGroup | undefined = devices?.[key];
        return { label: t(label), value: g ? `${g.connected}/${g.total}` : missing };
      };
      stats.push(
        group('ap', 'omada.ap'),
        group('switch', 'omada.switch'),
        group('gateway', 'omada.gateway'),
      );
      if (devices) {
        const unknown = devices.ap.unknown + devices.switch.unknown + devices.gateway.unknown;
        if (unknown > 0) stats.push({ label: t('omada.unknownState'), value: String(unknown) });
        if (devices.other > 0)
          stats.push({ label: t('omada.otherDevices'), value: String(devices.other) });
      }
      stats.push({
        label: t('omada.alerts'),
        value: data.alerts ? String(data.alerts.unresolved) : dash(),
      });
      return stats;
    },
  });
}
