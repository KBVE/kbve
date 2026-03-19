/**
 * ClickHouse schema types for dashboard consumers.
 *
 * Re-exports generated proto types with consumer-friendly aliases.
 * The proto-generated schema (clickhouse-schema.ts) is the source of truth.
 * Hand-written interfaces in clickhouseService.ts are replaced by these.
 */
import {
	LogEntrySchema,
	LogStatsBucketSchema,
	LogQueryRequestSchema,
	LogQueryResponseSchema,
	LogStatsResponseSchema,
	SeverityLevelSchema,
	SeverityLevels,
	type LogEntry,
	type LogStatsBucket,
	type LogQueryRequest,
	type LogQueryResponse,
	type LogStatsResponse,
	type SeverityLevelValue,
} from '../../../../../../packages/data/codegen/generated/clickhouse-schema';

// Re-export generated schemas
export {
	LogEntrySchema,
	LogStatsBucketSchema,
	LogQueryRequestSchema,
	LogQueryResponseSchema,
	LogStatsResponseSchema,
	SeverityLevelSchema,
	SeverityLevels,
};

// Re-export generated types
export type {
	LogEntry,
	LogStatsBucket,
	LogQueryRequest,
	LogQueryResponse,
	LogStatsResponse,
	SeverityLevelValue,
};

// ---------------------------------------------------------------------------
// Consumer-friendly aliases — map proto names to dashboard names.
// These are type aliases, not new interfaces. The proto is still the source.
// ---------------------------------------------------------------------------

/** A single log row from ClickHouse (alias for LogEntry) */
export type LogRow = LogEntry;
export const LogRowSchema = LogEntrySchema;

/**
 * A stats aggregation row as returned by the ClickHouse SQL query.
 * The SQL aliases count() as `cnt` (string), which differs from the proto
 * `LogStatsBucket.count` (number). This type reflects the actual wire format.
 */
export interface StatRow {
	pod_namespace: string;
	service: string;
	level: string;
	cnt: string;
}

// Re-export the proto version for consumers that need it
export { LogStatsBucketSchema as StatRowProtoSchema };

/** Log query response — rows are LogRow[] matching the SQL SELECT */
export interface QueryData {
	rows: LogRow[];
	count: number;
}

/** Stats query response (alias for LogStatsResponse with rows alias) */
export interface StatsData {
	rows: StatRow[];
	count: number;
}

/** Query parameters sent to the logs edge function */
export type QueryParams = {
	pod_namespace?: string | null;
	service?: string | null;
	level?: string | null;
	search?: string | null;
	minutes?: number;
	limit?: number;
};
