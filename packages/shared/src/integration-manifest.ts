/**
 * Built-in integration definitions. Pure data: nothing here runs code and nothing is loaded at
 * runtime from the database, the network or the user. The backend validates every manifest with a
 * schema at startup and runs it with one reviewed interpreter; the frontend generates the
 * connection form and the widget text from the same definitions. See docs/decisoes/0009.
 */
export type FieldKind = 'url' | 'text' | 'secret' | 'token-id';
export type ManifestField = {
  /** Stored key. `url` for the address, `secret` for the credential, `tokenId` for a token id. */
  key: string;
  kind: FieldKind;
  /** English default label; `labelKey` is an optional translation key. */
  label: string;
  labelKey?: string;
  placeholder?: string;
  placeholderKey?: string;
  help?: string;
  required: boolean;
  maxLength: number;
  /** Anchored regular expression the whole value must match. */
  pattern?: string;
  /** Prefilled when a connection of this type is created (a cloud API address, a default tailnet). */
  defaultValue?: string;
  /** url fields only */
  httpsOnly?: boolean;
  /** url fields only: keep a base path (for example a reverse proxy prefix). */
  allowPath?: boolean;
  /** Changing this field requires a new secret, because the credential identity changes. */
  identity?: boolean;
  /** Stable API error code when this field is invalid. */
  errorCode?: string;
};

export type Literal = string | number | boolean;
export type JsonPath = readonly (string | number)[];
export type Extraction =
  | {
      op: 'pick';
      out: string;
      request?: string;
      path: JsonPath;
      type: 'string' | 'boolean' | 'integer' | 'number';
      maxLength?: number;
      min?: number;
      max?: number;
      /** A missing or null value becomes null instead of an invalid response. */
      optional?: boolean;
    }
  | { op: 'config'; out: string; key: string }
  | {
      op: 'count';
      out: string;
      request?: string;
      path: JsonPath;
      where?: { path: JsonPath; equals: Literal };
      max?: number;
    }
  | {
      op: 'sum';
      out: string;
      request?: string;
      path: JsonPath;
      field: JsonPath;
      max: number;
    }
  | {
      op: 'last';
      out: string;
      request?: string;
      path: JsonPath;
      field: JsonPath;
      type: 'string' | 'integer' | 'number' | 'boolean';
      maxLength?: number;
    }
  | {
      /** Maps a value to a named state through a closed table. */
      op: 'state';
      out: string;
      request?: string;
      path: JsonPath;
      states: Readonly<Record<string, readonly Literal[]>>;
      other: string;
    }
  | {
      /** Counts the latest item of each entry per named state; `other` collects the rest. */
      op: 'tally';
      request?: string;
      /** An object whose values are arrays; each is looked at through its last element. */
      path: JsonPath;
      field: JsonPath;
      states: Readonly<Record<string, readonly Literal[]>>;
      other: string;
    };

export type DisplayValue = {
  from: string;
  /** Text for each raw value (`true`, `false`, or a string). */
  map?: Readonly<Record<string, { text: string; key?: string }>>;
};
export type DisplayStat = {
  label: string;
  labelKey?: string;
  /** Template over value names: `{name}`. */
  value: string;
  /** Hidden while this output key is zero. */
  hideWhenZero?: string;
};
export type ManifestDisplay = {
  /** Values by name; names not listed here read the output key of the same name. */
  values?: Readonly<Record<string, DisplayValue>>;
  summary: { text: string; key?: string };
  stats: readonly DisplayStat[];
};

type Identity = {
  type: string;
  label: string;
  /** Two or three letters shown when no logo is available. */
  mark: string;
  /** Name from BRAND_ICON_NAMES; omitted when no logo is bundled (the mark is shown instead). */
  brandIcon?: string;
  capabilities: readonly string[];
  fields: readonly ManifestField[];
};
export type AuthSpec =
  | { type: 'none' }
  | { type: 'bearer' }
  | { type: 'token' }
  | { type: 'api-key' }
  /** HTTP Basic with the secret as the user name and an empty password. */
  | { type: 'basic-key' }
  | { type: 'basic'; usernameField: string };
export type RequestSpec = {
  id: string;
  /** Closed template: literal text and `{field}` placeholders (URL-encoded; no expressions). */
  path: string;
  query?: Readonly<Record<string, string>>;
  expectStatus?: number;
  /** Response size limit in bytes, within the transport cap (default 262144). */
  maxBodyBytes?: number;
};
export type IntegrationManifest = Identity & {
  kind: 'manifest';
  auth: AuthSpec;
  requests: readonly RequestSpec[];
  /** Values that must equal a config field, or a literal, before the result is accepted. */
  require?: readonly {
    request?: string;
    path: JsonPath;
    equalsConfig?: string;
    equals?: Literal;
  }[];
  extract: readonly Extraction[];
  display: ManifestDisplay;
  /** Optional fixed messages. */
  messages?: { notFound?: string };
};
/** Adapters that stay code (multi-request, CA pinning, large payload). Metadata only. */
export type CodeDefinition = Identity & { kind: 'code'; display: 'custom' };
export type IntegrationDefinition = IntegrationManifest | CodeDefinition;

const urlField = (over: Partial<ManifestField> = {}): ManifestField => ({
  key: 'url',
  kind: 'url',
  label: 'Service URL',
  labelKey: 'connections.url',
  placeholderKey: 'connections.urlPlaceholder',
  required: true,
  maxLength: 2048,
  ...over,
});
const printable = '[\\x21-\\x7e]+';

export const proxmoxDefinition: CodeDefinition = {
  kind: 'code',
  type: 'proxmox',
  label: 'Proxmox VE',
  mark: 'PVE',
  brandIcon: 'proxmox',
  capabilities: ['inventory'],
  fields: [
    urlField({ httpsOnly: true, errorCode: 'https-url-required' }),
    {
      key: 'tokenId',
      kind: 'token-id',
      label: 'API token ID',
      labelKey: 'proxmox.tokenId',
      placeholderKey: 'proxmox.tokenIdPlaceholder',
      required: true,
      maxLength: 255,
      identity: true,
      errorCode: 'invalid-token',
    },
    {
      key: 'secret',
      kind: 'secret',
      label: 'API token secret',
      labelKey: 'proxmox.secret',
      required: true,
      maxLength: 512,
      errorCode: 'invalid-token',
    },
  ],
  display: 'custom',
};

export const jellyfinManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'jellyfin',
  label: 'Jellyfin',
  mark: 'J',
  brandIcon: 'jellyfin',
  capabilities: ['server-info'],
  fields: [urlField({ allowPath: true, errorCode: 'invalid-url' })],
  auth: { type: 'none' },
  requests: [{ id: 'info', path: '/System/Info/Public' }],
  extract: [
    { op: 'pick', out: 'name', path: ['ServerName'], type: 'string', maxLength: 256 },
    { op: 'pick', out: 'version', path: ['Version'], type: 'string', maxLength: 128 },
  ],
  display: {
    summary: { text: 'Server: {name} · Version: {version}', key: 'data.jellyfin' },
    stats: [
      { label: 'Server', labelKey: 'stat.server', value: '{name}' },
      { label: 'Version', labelKey: 'stat.version', value: '{version}' },
    ],
  },
};

export const homeAssistantManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'home-assistant',
  label: 'Home Assistant',
  mark: 'HA',
  brandIcon: 'home-assistant',
  capabilities: ['entity-state'],
  fields: [
    urlField({ httpsOnly: true, errorCode: 'https-url-required' }),
    {
      key: 'entityId',
      kind: 'text',
      label: 'Entity',
      labelKey: 'connections.entity',
      placeholderKey: 'connections.entityPlaceholder',
      required: true,
      maxLength: 255,
      pattern: '[a-z0-9_]+\\.[a-z0-9_]+',
      errorCode: 'invalid-entity',
    },
    {
      key: 'secret',
      kind: 'secret',
      label: 'Access token',
      labelKey: 'connections.accessToken',
      required: true,
      maxLength: 4096,
      pattern: printable,
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'bearer' },
  requests: [{ id: 'state', path: '/api/states/{entityId}' }],
  require: [{ path: ['entity_id'], equalsConfig: 'entityId' }],
  extract: [
    { op: 'config', out: 'entityId', key: 'entityId' },
    { op: 'pick', out: 'state', path: ['state'], type: 'string', maxLength: 1024 },
    {
      op: 'pick',
      out: 'lastUpdated',
      path: ['last_updated'],
      type: 'string',
      maxLength: 128,
      optional: true,
    },
  ],
  display: {
    values: { entity: { from: 'entityId' } },
    summary: { text: 'Entity: {entity} · State: {state}', key: 'data.homeAssistant' },
    stats: [{ label: 'State', labelKey: 'stat.state', value: '{state}' }],
  },
  messages: { notFound: 'Entity not found in Home Assistant.' },
};

export const uptimeKumaManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'uptime-kuma',
  label: 'Uptime Kuma',
  mark: 'UK',
  brandIcon: 'uptime-kuma',
  capabilities: ['status-page'],
  fields: [
    urlField({ errorCode: 'invalid-url' }),
    {
      key: 'slug',
      kind: 'text',
      label: 'Public page identifier',
      labelKey: 'connections.slug',
      required: true,
      maxLength: 100,
      pattern: '[A-Za-z0-9_-]+',
      errorCode: 'invalid-status-page',
    },
  ],
  auth: { type: 'none' },
  requests: [{ id: 'heartbeat', path: '/api/status-page/heartbeat/{slug}' }],
  extract: [
    {
      op: 'tally',
      path: ['heartbeatList'],
      field: ['status'],
      states: { up: [1], down: [0], pending: [2], maintenance: [3] },
      other: 'unknown',
    },
  ],
  display: {
    summary: {
      text: 'Up: {up} · Down: {down} · Pending: {pending} · Maintenance: {maintenance} · Unknown: {unknown}',
      key: 'data.uptimeKuma',
    },
    stats: [
      { label: 'Up', labelKey: 'stat.up', value: '{up}' },
      { label: 'Down', labelKey: 'stat.down', value: '{down}' },
      { label: 'Pending', labelKey: 'stat.pending', value: '{pending}', hideWhenZero: 'pending' },
      {
        label: 'Maintenance',
        labelKey: 'stat.maintenance',
        value: '{maintenance}',
        hideWhenZero: 'maintenance',
      },
      { label: 'Unknown', labelKey: 'stat.unknown', value: '{unknown}', hideWhenZero: 'unknown' },
    ],
  },
  messages: { notFound: 'Status page not found or not published on Uptime Kuma.' },
};

export const adguardManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'adguard-home',
  label: 'AdGuard Home',
  mark: 'A',
  brandIcon: 'adguard-home',
  capabilities: ['dns-status'],
  fields: [
    urlField({ httpsOnly: true, errorCode: 'https-url-required' }),
    {
      key: 'username',
      kind: 'text',
      label: 'Username',
      labelKey: 'connections.username',
      required: true,
      maxLength: 256,
      pattern: '[^:]+',
      identity: true,
      errorCode: 'invalid-credentials',
    },
    {
      key: 'secret',
      kind: 'secret',
      label: 'Password',
      labelKey: 'connections.password',
      required: true,
      maxLength: 4096,
      errorCode: 'invalid-credentials',
    },
  ],
  auth: { type: 'basic', usernameField: 'username' },
  requests: [{ id: 'status', path: '/control/status' }],
  extract: [
    { op: 'pick', out: 'running', path: ['running'], type: 'boolean' },
    { op: 'pick', out: 'protectionEnabled', path: ['protection_enabled'], type: 'boolean' },
    { op: 'pick', out: 'version', path: ['version'], type: 'string', maxLength: 128 },
  ],
  display: {
    values: {
      service: {
        from: 'running',
        map: {
          true: { text: 'running', key: 'data.running' },
          false: { text: 'stopped', key: 'data.stopped' },
        },
      },
      protection: {
        from: 'protectionEnabled',
        map: {
          true: { text: 'enabled', key: 'data.enabled' },
          false: { text: 'disabled', key: 'data.disabled' },
        },
      },
    },
    summary: {
      text: 'Service: {service} · Protection: {protection} · Version: {version}',
      key: 'data.adguard',
    },
    stats: [
      { label: 'Service', labelKey: 'stat.service', value: '{service}' },
      { label: 'Protection', labelKey: 'stat.protection', value: '{protection}' },
      { label: 'Version', labelKey: 'stat.version', value: '{version}' },
    ],
  },
};

export const speedtestTrackerManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'speedtest-tracker',
  label: 'Speedtest Tracker',
  mark: 'ST',
  capabilities: ['speedtest-results'],
  fields: [
    urlField({ httpsOnly: true, allowPath: true, errorCode: 'https-url-required' }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'API token',
      required: true,
      maxLength: 4096,
      pattern: printable,
      help: 'Create it at /admin/api-tokens with only the "Read Results" ability.',
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'bearer' },
  requests: [{ id: 'latest', path: '/api/v1/results/latest' }],
  extract: [
    { op: 'pick', out: 'download', path: ['download_bits_human'], type: 'string', maxLength: 40 },
    { op: 'pick', out: 'upload', path: ['upload_bits_human'], type: 'string', maxLength: 40 },
    { op: 'pick', out: 'ping', path: ['ping'], type: 'number', min: 0, max: 100000 },
  ],
  display: {
    summary: { text: 'Download: {download} · Upload: {upload} · Ping: {ping} ms' },
    stats: [
      { label: 'Download', labelKey: 'stat.download', value: '{download}' },
      { label: 'Upload', labelKey: 'stat.upload', value: '{upload}' },
      { label: 'Ping', labelKey: 'stat.ping', value: '{ping} ms' },
    ],
  },
  messages: { notFound: 'No speedtest result is available yet.' },
};

export const portainerManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'portainer',
  label: 'Portainer',
  mark: 'PT',
  brandIcon: 'portainer',
  capabilities: ['container-environments'],
  fields: [
    urlField({ httpsOnly: true, allowPath: true, errorCode: 'https-url-required' }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'Access token',
      labelKey: 'connections.accessToken',
      required: true,
      maxLength: 4096,
      pattern: printable,
      help: 'Create it in your Portainer account settings. Use a standard user that can only see the environments you want to show.',
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'api-key' },
  requests: [
    {
      id: 'environments',
      path: '/api/endpoints',
      query: { excludeSnapshots: 'true' },
      maxBodyBytes: 1_000_000,
    },
  ],
  extract: [
    { op: 'count', out: 'environments', path: [] },
    { op: 'count', out: 'up', path: [], where: { path: ['Status'], equals: 1 } },
    { op: 'count', out: 'down', path: [], where: { path: ['Status'], equals: 2 } },
  ],
  display: {
    summary: { text: 'Environments: {environments} · Up: {up} · Down: {down}' },
    stats: [
      { label: 'Environments', labelKey: 'stat.environments', value: '{environments}' },
      { label: 'Up', labelKey: 'stat.up', value: '{up}' },
      { label: 'Down', labelKey: 'stat.down', value: '{down}', hideWhenZero: 'down' },
    ],
  },
};

export const netbirdManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'netbird',
  label: 'NetBird',
  mark: 'NB',
  brandIcon: 'netbird',
  capabilities: ['network-peers'],
  fields: [
    urlField({
      httpsOnly: true,
      defaultValue: 'https://api.netbird.io',
      help: 'Use https://api.netbird.io for NetBird Cloud, or the address of your own management server.',
      errorCode: 'https-url-required',
    }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'Personal access token',
      required: true,
      maxLength: 4096,
      pattern: printable,
      help: 'Create it for a service user with the lowest role that can list peers.',
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'token' },
  requests: [{ id: 'peers', path: '/api/peers', maxBodyBytes: 2_000_000 }],
  extract: [
    { op: 'count', out: 'peers', path: [] },
    { op: 'count', out: 'connected', path: [], where: { path: ['connected'], equals: true } },
  ],
  display: {
    summary: { text: 'Peers: {peers} · Connected: {connected}' },
    stats: [
      { label: 'Peers', labelKey: 'stat.peers', value: '{peers}' },
      { label: 'Connected', labelKey: 'stat.connected', value: '{connected}' },
    ],
  },
};

/** Registration order is the order shown in the connection picker. */
export const integrationDefinitions: readonly IntegrationDefinition[] = [
  jellyfinManifest,
  homeAssistantManifest,
  uptimeKumaManifest,
  adguardManifest,
  speedtestTrackerManifest,
  portainerManifest,
  netbirdManifest,
  proxmoxDefinition,
];

export const integrationDefinition = (type: string) =>
  integrationDefinitions.find((definition) => definition.type === type);
