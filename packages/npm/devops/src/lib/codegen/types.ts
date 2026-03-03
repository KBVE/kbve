/**
 * Configuration types for the proto → Zod generator.
 *
 * The ProtoZodConfig drives all codegen behavior: which messages to include,
 * how fields map to Zod expressions, enum handling, type guards, and more.
 */

/** Per-enum configuration */
export interface EnumConfig {
	/** How to represent this enum in Zod output */
	mode: 'string' | 'enum' | 'const_array';
	/** Strip this prefix from values before casing. Auto-detected if omitted. */
	stripPrefix?: string;
	/** Case transform for values. Default: 'lowercase'. */
	caseTransform?: 'lowercase' | 'kebab-case' | 'none';
	/** Manual overrides: enum value name → output string */
	valueOverrides?: Record<string, string>;
	/** Skip the zero/UNSPECIFIED value? Default: true. */
	skipUnspecified?: boolean;
}

/** Const array export derived from a proto enum */
export interface ConstArrayConfig {
	/** Export name, e.g., "OSRSEquipmentSlots" */
	name: string;
	/** Fully qualified source enum, e.g., "kbve.osrs.OSRSSlot" */
	sourceEnum: string;
	/** Type alias name, e.g., "OSRSEquipmentSlot" */
	typeName?: string;
	/** Also emit a z.enum() schema? If so, its name. */
	zodSchemaName?: string;
}

/** Extra field to inject into a message (MDX-only, not in proto) */
export interface ExtraField {
	name: string;
	/** Raw Zod expression, e.g., "z.string().optional()" */
	zodExpr: string;
	/** Optional inline comment */
	comment?: string;
}

/** Type guard function definition */
export interface TypeGuardConfig {
	name: string;
	/** The type this guard receives as parameter */
	inputType: string;
	/** Return type annotation */
	returnType: string;
	/** Whether this is a type predicate (uses `is`) */
	isTypePredicate: boolean;
	/** Function body (raw code string) */
	body: string;
}

/** Helper function to append verbatim */
export interface HelperConfig {
	name: string;
	/** Full function code including export/signature/body */
	code: string;
}

/** Post-amble schema (depends on generated schemas, emitted after them) */
export interface PostambleConfig {
	/** Schema name identifier (for dependency ordering) */
	name: string;
	/** Raw TypeScript code */
	code: string;
}

/** Root configuration for proto → Zod generation */
export interface ProtoZodConfig {
	/** Fully qualified message names to include. Empty = include all non-excluded. */
	include?: string[];
	/** Fully qualified message names to exclude. */
	exclude?: string[];

	/** Field renames: "pkg.Message.field" → "new_name" */
	renames?: Record<string, string>;

	/** Override generated schema const name: "pkg.Message" → "CustomSchemaName" */
	schemaNames?: Record<string, string>;
	/** Override generated type name: "pkg.Message" → "CustomTypeName" */
	typeNames?: Record<string, string>;

	/** Messages that get .passthrough() */
	passthrough?: string[];

	/** Fields that get .nullable().optional(). Supports wildcards: "pkg.Msg.*" */
	nullable?: string[];

	/** Per-field Zod refinement appended after base type: "pkg.Msg.field" → ".min(1).max(99)" */
	refinements?: Record<string, string>;

	/** Per-field transform: "pkg.Msg.field" → "(s) => s.toLowerCase()" */
	transforms?: Record<string, string>;

	/** Per-enum configuration */
	enums?: Record<string, EnumConfig>;

	/** Const array exports from enums */
	constArrays?: ConstArrayConfig[];

	/** Extra MDX-only fields to inject per message */
	extraFields?: Record<string, ExtraField[]>;

	/** Completely override a field's Zod expression */
	fieldOverrides?: Record<string, string>;

	/** Type guard function definitions */
	typeGuards?: TypeGuardConfig[];

	/** Helper functions appended verbatim */
	helpers?: HelperConfig[];

	/** Preamble: raw TypeScript code blocks emitted before generated schemas */
	preamble?: string[];

	/** Postamble: schemas that depend on generated schemas, emitted after them */
	postamble?: PostambleConfig[];
}

/** Options for the main generator function */
export interface GenerateZodOptions {
	/** Path to the FileDescriptorSet binary (.binpb) */
	descriptorPath: string;
	/** Path to the zod-config.json */
	configPath: string;
	/** Output file path for the generated .ts */
	outputPath: string;
	/** Zod import source. Default: 'zod' */
	zodImport?: string;
	/** Filter to a specific proto package, e.g., 'kbve.osrs' */
	protoPackage?: string;
}
