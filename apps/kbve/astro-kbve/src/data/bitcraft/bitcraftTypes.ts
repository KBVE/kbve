/**
 * Bitcraft Game Types
 * Type definitions for Bitcraft professions, progress tracking, and calculator forms
 */

export type BitcraftProfession = 
  | "Carpentry"
  | "Farming" 
  | "Fishing"
  | "Foraging"
  | "Forestry"
  | "Hunting"
  | "Leatherworking"
  | "Masonry"
  | "Mining"
  | "Scholar"
  | "Smithing"
  | "Tailoring";

export interface ProfessionProgress {
  profession: BitcraftProfession;
  currentEffort: number;
  totalEffort: number;
  effortPerTick: number;
  timePerTick: number;
  lastUpdated: Date;
}

export interface BitcraftFormData {
  profession: BitcraftProfession;
  totalEffort: number;
  effortPerTick: number;
  timePerTick: number;
  currentProgress: number;
}

export interface ProfessionState {
  [key in BitcraftProfession]: ProfessionProgress;
}

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