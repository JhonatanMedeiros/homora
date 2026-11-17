import { defineWidget } from '../../index.js';

export const PUBLIC_IP_PROVIDERS = ['ipify', 'icanhazip'] as const;
export type PublicIpProvider = (typeof PUBLIC_IP_PROVIDERS)[number];

export const PUBLIC_IP_FAMILIES = ['ipv4', 'ipv6', 'both'] as const;
export type PublicIpFamily = (typeof PUBLIC_IP_FAMILIES)[number];

export type PublicIpConfig = {
  provider: PublicIpProvider;
  addressFamily: PublicIpFamily;
  optIn: boolean;
  maskByDefault: boolean;
};

export const defaultPublicIpConfig: PublicIpConfig = {
  provider: 'ipify',
  addressFamily: 'ipv4',
  optIn: false,
  maskByDefault: true,
};

const ALLOWED_KEYS = new Set(['provider', 'addressFamily', 'optIn', 'maskByDefault']);

export const widgetPublicIpWidget = defineWidget<PublicIpConfig>({
  type: 'public-ip',
  version: 1,
  locations: ['page'],
  sizes: ['normal'],
  source: null,
  portable: true,
  defaultConfig: defaultPublicIpConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (Object.keys(config).some((key) => !ALLOWED_KEYS.has(key))) return null;

    if (
      typeof config.provider !== 'string' ||
      !(PUBLIC_IP_PROVIDERS as readonly string[]).includes(config.provider)
    ) {
      return null;
    }

    if (
      typeof config.addressFamily !== 'string' ||
      !(PUBLIC_IP_FAMILIES as readonly string[]).includes(config.addressFamily)
    ) {
      return null;
    }

    if (typeof config.optIn !== 'boolean') return null;
    if (typeof config.maskByDefault !== 'boolean') return null;

    return {
      provider: config.provider as PublicIpProvider,
      addressFamily: config.addressFamily as PublicIpFamily,
      optIn: config.optIn,
      maskByDefault: config.maskByDefault,
    };
  },
});
