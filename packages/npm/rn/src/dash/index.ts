// @kbve/rn/dash — generic data-stream dashboard kit.
// `<T> of <t> of <n>`: a StreamSource (N) yields items (T), a StreamLens (t)
// projects each item into row/card/detail/stat models. Web-safe (no nav/icons),
// renders on native (Expo) and web (react-native-web via @kbve/rn-astro).

export * from './types';
export * from './createStreamSource';
export * from './useStream';
export * from './StreamView';
export * from './DashErrorBoundary';
export * from './dashFetch';
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
export * from './adapters/kilobaseBackup';
export * from './adapters/longhorn';
export * from './clickhouse';
export * from './adapters/cube';
export * from './cube';
export * from './S3BackupPanel';
export { McView, ServerCard, RconConsole, createRconExec } from './mc';
export type { McViewProps, RconExecFn } from './mc';
// Named, not `export *`: the root barrel already star-exports ./clickhouse, and
// an ambiguous name is dropped from the barrel silently rather than erroring
// here, surfacing as "has no exported member" at some unrelated import site.
export { TelemetryView, telemetryGroupsLens } from './telemetry';
export type { TelemetryViewProps, TelemetryGroupItem, TelemetryEventItem } from './telemetry';
export {
	WowView,
	NodeCard,
	CharacterTable,
	createWowMetricsStream,
	createWowRealmStream,
	createWowCharacterStream,
	createSoapExec,
	WOW_COMMANDS,
	WOW_NOT_PROVISIONED,
	isNotProvisioned,
	tickTone,
} from './wow';
export type {
	WowViewProps,
	WowNodeItem,
	WowRealm,
	WowRealmCounts,
	WowCharacter,
	WowAccountRow,
	SoapExecFn,
} from './wow';
