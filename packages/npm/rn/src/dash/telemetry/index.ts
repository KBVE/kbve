// Client error telemetry from metrics.kbve.com — NOT the ROWS request-rate
// telemetry in `dash/adapters/rows.tsx`. The two are unrelated.
export { TelemetryView } from './TelemetryView';
export type { TelemetryViewProps } from './TelemetryView';
export { EventDrawer } from './EventDrawer';
export type { EventDrawerProps } from './EventDrawer';
export { telemetryGroupsLens } from './telemetryLens';
export {
	createTelemetryGroupsStream,
	createTelemetryEventsStream,
	TELEMETRY_CONTROLS,
	METRICS_BASE,
} from './telemetryStreams';
export type { TelemetryStreamOptions } from './telemetryStreams';
export {
	normalizeTelemetryGroup,
	normalizeTelemetryEvent,
} from './telemetryTypes';
export type {
	RawTelemetryGroup,
	RawTelemetryEvent,
	TelemetryGroupItem,
	TelemetryEventItem,
} from './telemetryTypes';
