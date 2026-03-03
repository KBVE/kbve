/**
 * Proto → Zod code generator.
 *
 * Public API:
 *   generateZodFromProto  — returns generated TypeScript string
 *   generateAndWriteZod   — generates and writes to file
 */

export type {
	ProtoZodConfig,
	GenerateZodOptions,
	EnumConfig,
	ConstArrayConfig,
	ExtraField,
	TypeGuardConfig,
	HelperConfig,
	PostambleConfig,
} from './types.js';

export { generateZodFromProto, generateAndWriteZod } from './proto-to-zod.js';
