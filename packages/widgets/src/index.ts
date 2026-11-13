/** Internal widget contracts. The host owns placement, persistence and data access. */
export type WidgetLocation = 'page' | 'card' | 'top-bar';
export type WidgetStat = { label: string; value: string; id?: 'cpu' | 'memory' | 'disk' };

/** Source identifiers name a data contract, not a transport or credentials. */
export type WidgetSource = { contract: string; version: number };
export type WidgetDefinition<Config> = {
  type: string;
  version: number;
  locations: readonly WidgetLocation[];
  source: WidgetSource | null;
  parseConfig(value: unknown): Config | null;
};
export type WidgetState<Data> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'invalid' }
  | { status: 'none' }
  | { status: 'node-unavailable' }
  | { status: 'error' }
  | { status: 'ready'; data: Data };

/** A source is compatible only when both its contract and version match exactly. */
export function supportsSource(
  required: WidgetSource | null,
  offered: WidgetSource | null,
): boolean {
  return required === null
    ? offered === null
    : offered !== null &&
        required.contract === offered.contract &&
        required.version === offered.version;
}

export function defineWidget<Config>(
  definition: WidgetDefinition<Config>,
): WidgetDefinition<Config> {
  return definition;
}

/** Presentation is pure and receives only host-provided, validated observations. */
export type WidgetPresentation = {
  stats(value: unknown): WidgetStat[] | null;
  placeholderCount?: number;
};

export function definePresentation(presentation: WidgetPresentation): WidgetPresentation {
  return presentation;
}

/** Presentation transforms host-supplied input to safe display data. */
export type WidgetPresenter<Input, Output> = { present(input: Input): Output };
export function definePresenter<Input, Output>(
  presenter: WidgetPresenter<Input, Output>,
): WidgetPresenter<Input, Output> {
  return presenter;
}
