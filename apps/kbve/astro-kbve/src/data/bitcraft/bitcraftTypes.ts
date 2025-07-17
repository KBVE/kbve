import { z } from 'astro:schema';

/**
 * Bitcraft Game Types
 * Zod schemas and type definitions for Bitcraft professions, progress tracking, and calculator forms
 */

// Zod schema for BitcraftProfession
export const BitcraftProfessionSchema = z.enum([
  "Carpentry",
  "Farming",
  "Fishing",
  "Foraging",
  "Forestry",
  "Hunting",
  "Leatherworking",
  "Masonry",
  "Mining",
  "Scholar",
  "Smithing",
  "Tailoring"
]);

// Type inference from zod schema
export type BitcraftProfession = z.infer<typeof BitcraftProfessionSchema>;

// Zod schema for ProfessionProgress
export const ProfessionProgressSchema = z.object({
  profession: BitcraftProfessionSchema,
  currentEffort: z.number().min(0),
  totalEffort: z.number().min(1),
  effortPerTick: z.number().min(0),
  timePerTick: z.number().min(0),
  lastUpdated: z.date()
});

// Type inference from zod schema
export type ProfessionProgress = z.infer<typeof ProfessionProgressSchema>;

// Zod schema for BitcraftFormData
export const BitcraftFormDataSchema = z.object({
  profession: BitcraftProfessionSchema,
  totalEffort: z.number().min(1),
  effortPerTick: z.number().min(0),
  timePerTick: z.number().min(0),
  currentProgress: z.number().min(0), // Removed .max(100) since effort can exceed 100
  syncOffset: z.number().min(0).max(5000).optional() // Sync offset in milliseconds (0-5000ms)
});

// Type inference from zod schema
export type BitcraftFormData = z.infer<typeof BitcraftFormDataSchema>;

// Zod schema for ProfessionState
export const ProfessionStateSchema = z.record(
  BitcraftProfessionSchema,
  ProfessionProgressSchema
);

// Type inference from zod schema
export type ProfessionState = z.infer<typeof ProfessionStateSchema>;

// Validation utilities
export const validateProfession = (value: unknown): BitcraftProfession | null => {
  const result = BitcraftProfessionSchema.safeParse(value);
  return result.success ? result.data : null;
};

export const validateProfessionProgress = (value: unknown): ProfessionProgress | null => {
  const result = ProfessionProgressSchema.safeParse(value);
  return result.success ? result.data : null;
};

export const validateFormData = (value: unknown): BitcraftFormData | null => {
  const result = BitcraftFormDataSchema.safeParse(value);
  return result.success ? result.data : null;
};

export const validateProfessionState = (value: unknown): ProfessionState | null => {
  const result = ProfessionStateSchema.safeParse(value);
  return result.success ? result.data : null;
};

// Safe parsing with detailed error handling
export const parseProfessionProgress = (value: unknown) => {
  return ProfessionProgressSchema.safeParse(value);
};

export const parseFormData = (value: unknown) => {
  return BitcraftFormDataSchema.safeParse(value);
};

// Helper to create a validated ProfessionProgress object
export const createProfessionProgress = (
  profession: BitcraftProfession,
  currentEffort: number = 0,
  totalEffort: number = 1000,
  effortPerTick: number = 10,
  timePerTick: number = 1.0
): ProfessionProgress => {
  const progress = {
    profession,
    currentEffort,
    totalEffort,
    effortPerTick,
    timePerTick,
    lastUpdated: new Date()
  };
  
  // Validate the created object
  const result = ProfessionProgressSchema.safeParse(progress);
  if (!result.success) {
    throw new Error(`Invalid profession progress data: ${result.error.message}`);
  }
  
  return result.data;
};

// All professions array for iteration and validation
export const ALL_PROFESSIONS = BitcraftProfessionSchema.options;

export const PROFESSION_COLORS: Record<BitcraftProfession, string> = {
  Carpentry: "#8B4513",
  Farming: "#228B22",
  Fishing: "#4682B4",
  Foraging: "#32CD32",
  Forestry: "#006400",
  Hunting: "#8B4513",
  Leatherworking: "#A0522D",
  Masonry: "#696969",
  Mining: "#2F4F4F",
  Scholar: "#4B0082",
  Smithing: "#FF4500",
  Tailoring: "#9932CC"
};

export const DEFAULT_PROFESSION_SETTINGS: Record<BitcraftProfession, Omit<ProfessionProgress, 'profession' | 'lastUpdated'>> = {
  Carpentry: { currentEffort: 0, totalEffort: 12700, effortPerTick: 11, timePerTick: 1.53 },
  Farming: { currentEffort: 0, totalEffort: 10000, effortPerTick: 12, timePerTick: 1.4 },
  Fishing: { currentEffort: 0, totalEffort: 8500, effortPerTick: 9, timePerTick: 1.8 },
  Foraging: { currentEffort: 0, totalEffort: 6000, effortPerTick: 8, timePerTick: 1.2 },
  Forestry: { currentEffort: 0, totalEffort: 15000, effortPerTick: 13, timePerTick: 1.6 },
  Hunting: { currentEffort: 0, totalEffort: 11000, effortPerTick: 10, timePerTick: 1.7 },
  Leatherworking: { currentEffort: 0, totalEffort: 9500, effortPerTick: 14, timePerTick: 1.3 },
  Masonry: { currentEffort: 0, totalEffort: 18000, effortPerTick: 15, timePerTick: 1.9 },
  Mining: { currentEffort: 0, totalEffort: 20000, effortPerTick: 16, timePerTick: 2.0 },
  Scholar: { currentEffort: 0, totalEffort: 7500, effortPerTick: 7, timePerTick: 1.1 },
  Smithing: { currentEffort: 0, totalEffort: 16500, effortPerTick: 17, timePerTick: 2.2 },
  Tailoring: { currentEffort: 0, totalEffort: 8000, effortPerTick: 12, timePerTick: 1.4 }
};

// Default sync offset constant
export const DEFAULT_SYNC_OFFSET_MS = 250;

// Helper to get validated default settings for a profession
export const getDefaultProfessionSettings = (profession: BitcraftProfession) => {
  const settings = DEFAULT_PROFESSION_SETTINGS[profession];
  return createProfessionProgress(
    profession,
    settings.currentEffort,
    settings.totalEffort,
    settings.effortPerTick,
    settings.timePerTick
  );
};

export const PROFESSION_ICONS: Record<BitcraftProfession, string> = {
  Carpentry: "🪚",
  Farming: "🌾",
  Fishing: "🎣",
  Foraging: "🍄",
  Forestry: "🌲",
  Hunting: "🏹",
  Leatherworking: "🪣",
  Masonry: "🧱",
  Mining: "⛏️",
  Scholar: "📚",
  Smithing: "🔨",
  Tailoring: "✂️"
};