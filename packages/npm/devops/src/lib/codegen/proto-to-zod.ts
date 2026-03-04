/**
 * Orchestrator: loads proto descriptors + config, generates Zod schema TypeScript.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import {
	fromBinary,
	createFileRegistry,
	type FileRegistry,
	type DescMessage,
	type DescEnum,
} from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';
import type { ProtoZodConfig, GenerateZodOptions } from './types.js';
import { topoSortMessages } from './topo-sort.js';
import { emit } from './emitter.js';
import { isWellKnownType } from './field-mapper.js';

/**
 * Load and parse a FileDescriptorSet binary (.binpb).
 */
function loadDescriptor(descriptorPath: string) {
	const bytes = readFileSync(descriptorPath);
	const fds = fromBinary(FileDescriptorSetSchema, new Uint8Array(bytes));
	return createFileRegistry(fds);
}

/**
 * Load and parse a zod-config.json.
 */
function loadConfig(configPath: string): ProtoZodConfig {
	const raw = readFileSync(configPath, 'utf-8');
	return JSON.parse(raw) as ProtoZodConfig;
}

/** Normalize protoPackage to a Set for O(1) lookup */
function normalizePackages(
	protoPackage?: string | string[],
): Set<string> | undefined {
	if (!protoPackage) return undefined;
	if (typeof protoPackage === 'string') return new Set([protoPackage]);
	if (protoPackage.length === 0) return undefined;
	return new Set(protoPackage);
}

/**
 * Collect all messages from the registry, optionally filtered by package(s).
 */
function collectMessages(
	registry: FileRegistry,
	config: ProtoZodConfig,
	packages?: Set<string>,
): DescMessage[] {
	const messages: DescMessage[] = [];

	for (const file of registry.files) {
		// Filter by package if specified
		if (packages && !packages.has(file.proto.package ?? '')) {
			continue;
		}

		// Walk all messages in this file (including nested)
		const queue: DescMessage[] = [...file.messages];
		while (queue.length > 0) {
			const msg = queue.pop()!;

			// Skip well-known types (they're inlined as Zod expressions)
			if (isWellKnownType(msg.typeName)) continue;

			// Apply include/exclude filters
			if (config.include && config.include.length > 0) {
				if (!config.include.includes(msg.typeName)) continue;
			}
			if (config.exclude?.includes(msg.typeName)) {
				continue;
			}

			messages.push(msg);

			// Check nested messages
			for (const nested of msg.nestedMessages) {
				queue.push(nested);
			}
		}
	}

	return messages;
}

/**
 * Collect all enums from the registry, optionally filtered by package(s).
 */
function collectEnums(
	registry: FileRegistry,
	packages?: Set<string>,
): Map<string, DescEnum> {
	const enums = new Map<string, DescEnum>();

	for (const file of registry.files) {
		if (packages && !packages.has(file.proto.package ?? '')) {
			continue;
		}

		for (const enumDesc of file.enums) {
			enums.set(enumDesc.typeName, enumDesc);
		}

		// Also check enums nested inside messages
		const queue: DescMessage[] = [...file.messages];
		while (queue.length > 0) {
			const msg = queue.pop()!;
			for (const enumDesc of msg.nestedEnums) {
				enums.set(enumDesc.typeName, enumDesc);
			}
			for (const nested of msg.nestedMessages) {
				queue.push(nested);
			}
		}
	}

	return enums;
}

/**
 * Generate Zod schema TypeScript from proto descriptors + config.
 *
 * @param options - Generator options
 * @returns The generated TypeScript source string
 */
export async function generateZodFromProto(
	options: GenerateZodOptions,
): Promise<string> {
	const {
		descriptorPath,
		configPath,
		zodImport = 'zod',
		protoPackage,
	} = options;

	// Load inputs
	const registry = loadDescriptor(resolve(descriptorPath));
	const config = loadConfig(resolve(configPath));

	// Normalize package filter
	const packages = normalizePackages(protoPackage);

	// Collect types
	const messages = collectMessages(registry, config, packages);
	const enums = collectEnums(registry, packages);

	// Topological sort with cycle detection
	const { sorted: sortedMessages, lazyRefs } = topoSortMessages(messages);

	// Emit output
	const output = emit({
		sortedMessages,
		enums,
		config,
		zodImport,
		lazyRefs,
		protoSource: relative(dirname(options.outputPath), descriptorPath),
		configSource: relative(dirname(options.outputPath), configPath),
	});

	return output;
}

/**
 * Generate and write Zod schema TypeScript to a file.
 *
 * @param options - Generator options (includes outputPath)
 */
export async function generateAndWriteZod(
	options: GenerateZodOptions,
): Promise<void> {
	const output = await generateZodFromProto(options);

	// Ensure output directory exists
	mkdirSync(dirname(resolve(options.outputPath)), { recursive: true });

	writeFileSync(resolve(options.outputPath), output, 'utf-8');
}
