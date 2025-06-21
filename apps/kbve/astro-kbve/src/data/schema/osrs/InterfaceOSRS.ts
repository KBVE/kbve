import { z } from 'zod';

// =============================================================================
// CORE SCHEMAS
// =============================================================================

export const UserSecretSchema = z.object({
  user_id: z.string().uuid(),
  key: z.string().regex(/^[a-z0-9_]{3,64}$/),
  vault_key: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const OsrsAccountSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  account_name: z.string().regex(/^[a-z0-9_]{3,64}$/),
  vault_email_key: z.string(),
  vault_password_key: z.string(),
  state: z.enum(['offline', 'active', 'banned', 'error']),
  world: z.number().int().nullable(),
  p2p: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const OsrsAccountListEntrySchema = OsrsAccountSchema.pick({
  account_name: true,
  state: true,
  world: true,
  p2p: true,
  created_at: true,
  updated_at: true,
});

export const OsrsAccountInfoSchema = z.object({
  username: z.string().min(3).max(32).optional(),
  combat_level: z.number().int().min(3).max(126),
  total_level: z.number().int().min(0).max(2277),
  quest_points: z.number().int().min(0).max(300),
  notes: z.string().max(500).optional(),
  last_synced_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// =============================================================================
// TYPE INFERENCES
// =============================================================================

export type UserSecret = z.infer<typeof UserSecretSchema>;
export type OsrsAccount = z.infer<typeof OsrsAccountSchema>;
export type OsrsAccountListEntry = z.infer<typeof OsrsAccountListEntrySchema>;
export type OsrsAccountInfo = z.infer<typeof OsrsAccountInfoSchema>;

// =============================================================================
// FORM INPUT SCHEMAS
// =============================================================================

export const CreateOsrsAccountInputSchema = z.object({
  account_name: z.string().regex(/^[a-z0-9_]{3,64}$/, 'Account name must be 3-64 characters, lowercase letters, numbers, and underscores only'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be less than 128 characters'),
  world: z.number().int().min(1).max(999).nullable().optional(),
  p2p: z.boolean().optional().default(false),
});

export const UpdateOsrsAccountInfoInputSchema = z.object({
  account_name: z.string().regex(/^[a-z0-9_]{3,64}$/),
  username: z.string().min(3).max(32).optional(),
  combat_level: z.number().int().min(3).max(126).optional(),
  total_level: z.number().int().min(0).max(2277).optional(),
  quest_points: z.number().int().min(0).max(300).optional(),
  notes: z.string().max(500).optional(),
});

export const SetUserSecretInputSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{3,64}$/, 'Key must be 3-64 characters, lowercase letters, numbers, and underscores only'),
  value: z.string().min(1, 'Value cannot be empty').max(1000, 'Value too long'),
});

// =============================================================================
// API RESPONSE SCHEMAS
// =============================================================================

export const SupabaseErrorSchema = z.object({
  message: z.string(),
  details: z.string().optional(),
  hint: z.string().optional(),
  code: z.string().optional(),
});

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullable(),
    error: SupabaseErrorSchema.nullable(),
  });

// =============================================================================
// TYPE INFERENCES FOR INPUTS
// =============================================================================

export type CreateOsrsAccountInput = z.infer<typeof CreateOsrsAccountInputSchema>;
export type UpdateOsrsAccountInfoInput = z.infer<typeof UpdateOsrsAccountInfoInputSchema>;
export type SetUserSecretInput = z.infer<typeof SetUserSecretInputSchema>;
export type SupabaseError = z.infer<typeof SupabaseErrorSchema>;

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type OsrsAccountState = OsrsAccount['state'];
export type AccountValidationResult = {
  isValid: boolean;
  errors: string[];
};

// State display helpers
export const OSRS_ACCOUNT_STATES = {
  offline: { label: 'Offline', color: 'gray', icon: '⚫' },
  active: { label: 'Active', color: 'green', icon: '🟢' },
  banned: { label: 'Banned', color: 'red', icon: '🔴' },
  error: { label: 'Error', color: 'yellow', icon: '🟡' },
} as const;

// World ranges for P2P/F2P
export const OSRS_WORLD_RANGES = {
  F2P: { min: 1, max: 99 },
  P2P: { min: 300, max: 599 },
} as const;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export const validateAccountName = (name: string): AccountValidationResult => {
  const result: AccountValidationResult = { isValid: true, errors: [] };
  
  if (name.length < 3) {
    result.errors.push('Account name must be at least 3 characters');
  }
  
  if (name.length > 64) {
    result.errors.push('Account name must be no more than 64 characters');
  }
  
  if (!/^[a-z0-9_]+$/.test(name)) {
    result.errors.push('Account name can only contain lowercase letters, numbers, and underscores');
  }
  
  result.isValid = result.errors.length === 0;
  return result;
};

export const isP2PWorld = (world: number | null): boolean => {
  if (!world) return false;
  return world >= OSRS_WORLD_RANGES.P2P.min && world <= OSRS_WORLD_RANGES.P2P.max;
};

// =============================================================================
// SECRET KEY GENERATION HELPERS
// =============================================================================

/**
 * Generates a safe secret key for email storage
 * Simple pattern: {account_name}_email
 * Example: account "mage_skiller1" → "mage_skiller1_email"
 */
export const generateEmailKey = (email: string, accountName: string): string => {
  return `${accountName}_email`;
};

/**
 * Generates a safe secret key for password storage
 * Example: account "my_main" → "my_main_password"
 */
export const generatePasswordKey = (accountName: string): string => {
  return `${accountName}_password`;
};

/**
 * Validates that a generated key meets the requirements
 */
export const validateSecretKey = (key: string): boolean => {
  return /^[a-z0-9_]{3,64}$/.test(key);
};

// =============================================================================
// ACCOUNT CREATION FLOW HELPERS
// =============================================================================

/**
 * Complete account creation flow with automatic secret management
 * This handles the two-step process:
 * 1. Store email/password as secrets with auto-generated keys
 * 2. Create OSRS account referencing those secret keys
 */
export interface CreateAccountFlowInput {
  account_name: string;
  email: string;
  password: string;
  world?: number | null;
  p2p?: boolean;
}

export interface CreateAccountFlowResult {
  success: boolean;
  error?: string;
  emailKey?: string;
  passwordKey?: string;
}

/**
 * Generates the secret keys that will be used for an account
 * Returns the keys that would be generated without actually creating anything
 */
export const generateSecretKeys = (accountName: string, email: string) => {
  const emailKey = generateEmailKey(email, accountName);
  const passwordKey = generatePasswordKey(accountName);
  
  return {
    emailKey,
    passwordKey,
    isValid: validateSecretKey(emailKey) && validateSecretKey(passwordKey)
  };
};

// =============================================================================
// ERROR HANDLING TYPES
// =============================================================================

export type SecretKeyError = 
  | 'EMAIL_KEY_TOO_LONG'
  | 'PASSWORD_KEY_TOO_LONG'
  | 'INVALID_EMAIL_FORMAT'
  | 'INVALID_ACCOUNT_NAME'
  | 'KEY_GENERATION_FAILED';

export const SECRET_KEY_ERROR_MESSAGES: Record<SecretKeyError, string> = {
  EMAIL_KEY_TOO_LONG: 'Email address is too long for this account name',
  PASSWORD_KEY_TOO_LONG: 'Account name is too long for password key generation',
  INVALID_EMAIL_FORMAT: 'Email address contains invalid characters',
  INVALID_ACCOUNT_NAME: 'Account name contains invalid characters',
  KEY_GENERATION_FAILED: 'Failed to generate valid secret keys',
};

// =============================================================================
// PARTIAL SCHEMAS FOR UPDATES
// =============================================================================

export const PartialOsrsAccountInfoSchema = OsrsAccountInfoSchema.partial().omit({
  last_synced_at: true,
  updated_at: true,
});

export type PartialOsrsAccountInfo = z.infer<typeof PartialOsrsAccountInfoSchema>;

// =============================================================================
// FORM FIELD CONFIGURATIONS
// =============================================================================

export const FORM_FIELD_CONFIG = {
  account_name: {
    label: 'Account Name',
    placeholder: 'Enter account name (a-z, 0-9, _)',
    maxLength: 64,
    pattern: '^[a-z0-9_]{3,64}$',
  },
  email: {
    label: 'Email',
    placeholder: 'Enter email address',
    type: 'email' as const,
  },
  password: {
    label: 'Password',
    placeholder: 'Enter password',
    type: 'password' as const,
    minLength: 8,
    maxLength: 128,
  },
  username: {
    label: 'Display Name',
    placeholder: 'Enter display name (optional)',
    maxLength: 32,
  },
  world: {
    label: 'World',
    placeholder: 'Enter world number (optional)',
    type: 'number' as const,
    min: 1,
    max: 999,
  },
  combat_level: {
    label: 'Combat Level',
    placeholder: 'Enter combat level',
    type: 'number' as const,
    min: 3,
    max: 126,
  },
  total_level: {
    label: 'Total Level',
    placeholder: 'Enter total level',
    type: 'number' as const,
    min: 0,
    max: 2277,
  },
  quest_points: {
    label: 'Quest Points',
    placeholder: 'Enter quest points',
    type: 'number' as const,
    min: 0,
    max: 300,
  },
  notes: {
    label: 'Notes',
    placeholder: 'Enter notes (optional)',
    maxLength: 500,
    rows: 3,
  },
} as const;