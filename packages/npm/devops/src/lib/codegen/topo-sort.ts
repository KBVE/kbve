/**
 * Topological sort for proto messages by field dependencies.
 * Ensures referenced messages are emitted before referencing messages.
 */

import type { DescMessage, DescField } from '@bufbuild/protobuf';

/** Collect message dependencies from all fields */
function getDependencies(msg: DescMessage, included: Set<string>): string[] {
	const deps: string[] = [];
	for (const field of msg.fields) {
		let depName: string | undefined;
		if (field.fieldKind === 'message') {
			depName = field.message.typeName;
		} else if (field.fieldKind === 'list' && field.listKind === 'message') {
			depName = field.message.typeName;
		} else if (field.fieldKind === 'map' && field.mapKind === 'message') {
			depName = field.message.typeName;
		}
		if (depName && included.has(depName) && !deps.includes(depName)) {
			deps.push(depName);
		}
	}
	return deps;
}

/**
 * Topologically sort messages so dependencies are emitted first.
 * Uses DFS post-order traversal.
 */
export function topoSortMessages(messages: DescMessage[]): DescMessage[] {
	const included = new Set(messages.map((m) => m.typeName));
	const msgMap = new Map(messages.map((m) => [m.typeName, m]));
	const visited = new Set<string>();
	const result: DescMessage[] = [];

	function visit(typeName: string): void {
		if (visited.has(typeName)) return;
		visited.add(typeName);

		const msg = msgMap.get(typeName);
		if (!msg) return;

		for (const dep of getDependencies(msg, included)) {
			visit(dep);
		}
		result.push(msg);
	}

	for (const msg of messages) {
		visit(msg.typeName);
	}

	return result;
}
