import { integrationDefinitions } from './generated/definitions.js';

/**
 * Built-in integration definitions. Pure data: nothing here runs code and nothing is loaded at
 * runtime from the database, the network or the user. The backend validates every manifest with a
 * schema at startup and runs it with one reviewed interpreter; the frontend generates the
 * connection form and the widget text from the same definitions. See docs/decisions/0009.
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
  /** The form offers a choice list read from the connection (only while editing a saved connection). */
  picker?: 'host-node';
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
      /** Project named, bounded fields from grouped items, with a keyed state lookup. */
      op: 'rows';
      out: string;
      request?: string;
      path: JsonPath;
      items: JsonPath;
      key: JsonPath;
      keyType: 'integer' | 'string';
      maxKeyLength?: number;
      fields: Readonly<
        Record<
          string,
          {
            source: 'item' | 'group';
            path: JsonPath;
            type: 'string' | 'integer' | 'number' | 'boolean';
            maxLength?: number;
            min?: number;
            max?: number;
          }
        >
      >;
      max: number;
      lookup: {
        out: string;
        request: string;
        path: JsonPath;
        field: JsonPath;
        states: Readonly<Record<string, readonly Literal[]>>;
        other: string;
      };
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
  /** Shape of authenticated inventory offered to host workflows, when supported. */
  inventoryDomain?: 'hosts' | 'resources';
  /** The widget supplies CPU, memory or disk statistics for the optional top bar. */
  systemTelemetry?: boolean;
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

export * from './generated/definitions.js';

export const integrationDefinition = (type: string) =>
  integrationDefinitions.find((definition) => definition.type === type);

/** Match the shape of an inventory, independent of the integration's identifier. */
export const hasInventoryDomain = (type: string, domain: 'hosts' | 'resources'): boolean =>
  integrationDefinition(type)?.inventoryDomain === domain;

export const hasSystemTelemetry = (type: string): boolean =>
  integrationDefinition(type)?.systemTelemetry === true;
