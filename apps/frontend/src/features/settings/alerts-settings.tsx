import { MonitoringSettings } from './monitoring-settings';
import { NotificationSettings } from './notification-settings';

/** Where alerts go and how new services are checked, on one page. */
export function AlertsSettings() {
  return (
    <div className="flex flex-col gap-8">
      <NotificationSettings />
      <MonitoringSettings />
    </div>
  );
}
