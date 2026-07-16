// @kbve/rn/dash — generic data-stream dashboard kit.
// `<T> of <t> of <n>`: a StreamSource (N) yields items (T), a StreamLens (t)
// projects each item into row/card/detail/stat models. Web-safe (no nav/icons),
// renders on native (Expo) and web (react-native-web via @kbve/rn-astro).

export * from './types';
export * from './createStreamSource';
export * from './useStream';
export * from './StreamView';
export * from './StatGrid';
export * from './adapters/argo';
export * from './adapters/grafana';
export * from './adapters/clickhouse';
export * from './adapters/deployment';
export * from './adapters/edge';
export * from './adapters/forgejo';
export * from './adapters/vm';
export * from './adapters/rows';
export * from './adapters/factorio';
export * from './adapters/minecraft';
// Named (not `export *`): './adapters/clickhouse' already exports
// `createClickHouseStream`/`ClickHouseStreamOptions` (legacy factory); the
// clickhouse/ composition's same-named v2 factory stays reachable via
// `@kbve/rn/dash/clickhouse` to avoid an ambiguous re-export (TS2308).
export {
	ClickHouseView,
	createErrorGroupsStream,
	errorGroupsLens,
	CH_CONTROLS,
	CH_DEFAULT_VIEWS,
	buildStatsTotals,
} from './clickhouse';
export type { ClickHouseViewProps } from './clickhouse';
