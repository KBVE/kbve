import { z } from 'zod';

// Enums
export const BENTO_VARIANTS = ['default', 'minimal', 'image-heavy'] as const;
export const BENTO_ANIMATIONS = ['fade-in', 'slide-up', 'none'] as const;
export const BENTO_TARGETS = ['_self', '_blank', '_parent', '_top'] as const;
export const BENTO_ROLES = ['button', 'link', 'region', 'article'] as const;
export const BENTO_BADGE_TYPES = ['default', 'success', 'warning', 'error'] as const;

// Regex validators
const tailwindColorRegex = /^[a-z]+-(100|200|300|400|500|600|700|800|900)$/;
const spanRegex = /^(col-span-\d+|row-span-\d+|col-span-\d+\s+row-span-\d+)$/;
const ulidRegex = /^01[0-9A-HJKMNP-TV-Z]{24}$/;

// Schema
export const BentoTileSchema = z.object({
  id: z.string().regex(ulidRegex, 'Invalid ULID format').optional(),

  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  span: z.string().regex(spanRegex, 'Invalid span format (e.g., col-span-2, row-span-1)').optional(),

  primaryColor: z.string().regex(tailwindColorRegex, 'Invalid Tailwind color format (e.g., blue-500)'),
  secondaryColor: z.string().regex(tailwindColorRegex, 'Invalid Tailwind color format (e.g., blue-500)'),

  icon: z.string().optional(),
  backgroundImage: z.string().url().optional(),

  onclick: z.string().optional(),
  href: z.string().url().optional(),
  target: z.enum(BENTO_TARGETS).optional(),

  ariaLabel: z.string().optional(),
  role: z.enum(BENTO_ROLES).optional(),

  variant: z.enum(BENTO_VARIANTS).optional(),
  animation: z.enum(BENTO_ANIMATIONS).optional(),

  badge: z.string().optional(),
  badgeType: z.enum(BENTO_BADGE_TYPES).optional(),

  priority: z.number().int().min(0).optional(),
  tooltip: z.string().optional(),
  disabled: z.boolean().optional(),

  meta: z.record(z.any()).optional(),
  dataset: z.record(z.string()).optional(),
}).refine(
  (data) => !data.href || (data.href && data.target),
  { message: 'target is required when href is provided', path: ['target'] }
).refine(
  (data) => !data.badgeType || (data.badge && data.badge.length > 0),
  { message: 'badge must be provided if badgeType is set', path: ['badge'] }
);

// Types
export type BentoTile = z.infer<typeof BentoTileSchema>;
export type BentoVariantClass = { base: string; hover?: string };

// Mappings
export const BENTO_VARIANT_CLASS_MAP: Record<(typeof BENTO_VARIANTS)[number], BentoVariantClass> = {
  default: { base: 'p-4 flex flex-col justify-between' },
  minimal: { base: 'p-2 bg-opacity-30 backdrop-blur-sm', hover: 'bg-opacity-50' },
  'image-heavy': { base: 'p-0 overflow-hidden', hover: 'scale-105' },
};

export const BENTO_ANIMATION_CLASS_MAP: Record<(typeof BENTO_ANIMATIONS)[number], string> = {
  'fade-in': 'animate-fade-in',
  'slide-up': 'animate-slide-up',
  none: '',
};

export const BENTO_BADGE_CLASS_MAP: Record<(typeof BENTO_BADGE_TYPES)[number], string> = {
  default: 'bg-white/30 text-white',
  success: 'bg-green-500/80 text-white',
  warning: 'bg-yellow-500/80 text-black',
  error: 'bg-red-500/80 text-white',
};
