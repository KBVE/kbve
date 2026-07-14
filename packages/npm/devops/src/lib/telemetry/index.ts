import { z } from 'zod';
import {
	ErrorGroupSchema,
	ErrorEventSchema,
	type ErrorGroup,
	type ErrorEvent,
} from './generated/telemetry-schema';

export {
	ErrorGroupSchema,
	ErrorGroupListSchema,
	ErrorEventSchema,
	ErrorBatchSchema,
} from './generated/telemetry-schema';
export type {
	ErrorGroup,
	ErrorGroupList,
	ErrorEvent,
	ErrorBatch,
} from './generated/telemetry-schema';

export const TELEMETRY_DATABASE = 'telemetry';
export const ERROR_GROUPS_VIEW = `${TELEMETRY_DATABASE}.error_groups`;
export const ERRORS_TABLE = `${TELEMETRY_DATABASE}.errors_distributed`;

const ErrorGroupsArray = z.array(ErrorGroupSchema);
const ErrorEventsArray = z.array(ErrorEventSchema);

function quote(value: string): string {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function clampLimit(limit: number | undefined, fallback: number): number {
	if (!Number.isFinite(limit ?? NaN)) return fallback;
	return Math.min(Math.max(Math.trunc(limit as number), 1), 1000);
}

export interface ErrorGroupsQuery {
	project?: string;
	limit?: number;
}

export function buildErrorGroupsQuery(params: ErrorGroupsQuery = {}): string {
	const where =
		params.project !== undefined
			? `WHERE project = ${quote(params.project)}`
			: '';
	const limit = clampLimit(params.limit, 100);
	return [
		'SELECT project, fingerprint, error_type, sample_message,',
		'toString(events) AS events, toString(sessions) AS sessions,',
		'toString(first_seen) AS first_seen, toString(last_seen) AS last_seen',
		`FROM ${ERROR_GROUPS_VIEW}`,
		where,
		'ORDER BY last_seen DESC',
		`LIMIT ${limit}`,
	]
		.filter(Boolean)
		.join(' ');
}

export interface ErrorEventsQuery {
	fingerprint: string;
	project?: string;
	limit?: number;
}

export function buildErrorEventsQuery(params: ErrorEventsQuery): string {
	const conds = [`fingerprint = ${quote(params.fingerprint)}`];
	if (params.project !== undefined)
		conds.push(`project = ${quote(params.project)}`);
	const limit = clampLimit(params.limit, 50);
	return [
		'SELECT project, platform, release, environment, error_type, message,',
		'stack, url, user_id, session_id, handled, extra',
		`FROM ${ERRORS_TABLE}`,
		`WHERE ${conds.join(' AND ')}`,
		'ORDER BY timestamp DESC',
		`LIMIT ${limit}`,
	].join(' ');
}

export function parseErrorGroups(rows: unknown): ErrorGroup[] {
	return ErrorGroupsArray.parse(rows);
}

export function parseErrorEvents(rows: unknown): ErrorEvent[] {
	return ErrorEventsArray.parse(rows);
}

export function groupEventCount(group: ErrorGroup): number {
	return Number(group.events) || 0;
}

export function groupSessionCount(group: ErrorGroup): number {
	return Number(group.sessions) || 0;
}
