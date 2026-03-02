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

/**
 * Collect all messages from the registry, optionally filtered by package.
 */
function collectMessages(
	registry: FileRegistry,
	config: ProtoZodConfig,
	protoPackage?: string,
): DescMessage[] {
	const messages: DescMessage[] = [];

	for (const file of registry.files) {
		// Filter by package if specified
		if (protoPackage && file.proto.package !== protoPackage) {
			continue;
		}

		// Walk all messages in this file (including nested)
		const queue: DescMessage[] = [...file.messages];
		while (queue.length > 0) {
			const msg = queue.pop()!;

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
 * Collect all enums from the registry, optionally filtered by package.
 */
function collectEnums(
	registry: FileRegistry,
	protoPackage?: string,
): Map<string, DescEnum> {
	const enums = new Map<string, DescEnum>();

	for (const file of registry.files) {
		if (protoPackage && file.proto.package !== protoPackage) {
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

	// Collect types
	const messages = collectMessages(registry, config, protoPackage);
	const enums = collectEnums(registry, protoPackage);

	// Topological sort
	const sortedMessages = topoSortMessages(messages);

	// Emit output
	const output = emit({
		sortedMessages,
		enums,
		config,
		zodImport,
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
