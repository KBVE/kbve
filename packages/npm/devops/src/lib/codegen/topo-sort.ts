/**
 * Topological sort for proto messages by field dependencies.
 * Ensures referenced messages are emitted before referencing messages.
 * Uses three-color DFS to detect circular dependencies.
 */

import type { DescMessage, DescField } from '@bufbuild/protobuf';

/** Result of topological sort including cycle detection */
export interface TopoSortResult {
	/** Messages in dependency order (deps first) */
	sorted: DescMessage[];
	/** Type names that are part of cycles and need z.lazy() */
	lazyRefs: Set<string>;
}

/** Extract message dependency from a single field */
function getFieldDep(field: DescField): string | undefined {
	if (field.fieldKind === 'message') {
		return field.message.typeName;
	} else if (field.fieldKind === 'list' && field.listKind === 'message') {
		return field.message.typeName;
	} else if (field.fieldKind === 'map' && field.mapKind === 'message') {
		return field.message.typeName;
	}
	return undefined;
}

/** Collect message dependencies from all fields and oneof groups */
function getDependencies(msg: DescMessage, included: Set<string>): string[] {
	const deps: string[] = [];

	for (const field of msg.fields) {
		const depName = getFieldDep(field);
		if (depName && included.has(depName) && !deps.includes(depName)) {
			deps.push(depName);
		}
	}

	// Also walk oneof fields (they're already in msg.fields, but check
	// explicitly in case of future changes to the descriptor API)
	for (const oneof of msg.oneofs) {
		for (const field of oneof.fields) {
			const depName = getFieldDep(field);
			if (depName && included.has(depName) && !deps.includes(depName)) {
				deps.push(depName);
			}
		}
	}

	return deps;
}

/** Three-color DFS states */
const enum Color {
	WHITE = 0, // Not yet visited
	GRAY = 1, // Currently being visited (on the DFS stack)
	BLACK = 2, // Fully processed
}

/**
 * Topologically sort messages so dependencies are emitted first.
 * Uses three-color DFS to detect cycles and mark them for z.lazy().
 */
export function topoSortMessages(messages: DescMessage[]): TopoSortResult {
	const included = new Set(messages.map((m) => m.typeName));
	const msgMap = new Map(messages.map((m) => [m.typeName, m]));
	const color = new Map<string, Color>();
	const result: DescMessage[] = [];
	const lazyRefs = new Set<string>();

	for (const m of messages) {
		color.set(m.typeName, Color.WHITE);
	}

	function visit(typeName: string): void {
		const c = color.get(typeName);
		if (c === Color.BLACK) return;
		if (c === Color.GRAY) {
			// Back edge → cycle detected. Mark this type for z.lazy()
			lazyRefs.add(typeName);
			return;
		}

		color.set(typeName, Color.GRAY);

		const msg = msgMap.get(typeName);
		if (!msg) {
			color.set(typeName, Color.BLACK);
			return;
		}

		for (const dep of getDependencies(msg, included)) {
			visit(dep);
		}

		color.set(typeName, Color.BLACK);
		result.push(msg);
	}

	for (const msg of messages) {
		visit(msg.typeName);
	}

	return { sorted: result, lazyRefs };
}
