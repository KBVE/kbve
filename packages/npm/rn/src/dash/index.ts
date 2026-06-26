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
