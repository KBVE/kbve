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
export * from './adapters/kilobaseBackup';
export * from './clickhouse';
export * from './adapters/cube';
export * from './cube';
export * from './S3BackupPanel';
export { McView, ServerCard, RconConsole, createRconExec } from './mc';
export type { McViewProps, RconExecFn } from './mc';
