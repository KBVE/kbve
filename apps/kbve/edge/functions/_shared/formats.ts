// ---------------------------------------------------------------------------
// Centralized format constants & regex patterns
//
// Single source of truth for all ID/name/value format validation.
// Import from here instead of defining per-module duplicates.
// ---------------------------------------------------------------------------

// UUID v4 (case-insensitive, dashed)
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ULID — 26 Crockford Base32 characters
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// Discord snowflake — 17-20 digit string
export const SNOWFLAKE_RE = /^\d{17,20}$/;

// Minecraft UUID — 32 hex chars, no dashes
export const MC_UUID_RE = /^[a-f0-9]{32}$/;

// Service key — lowercase alphanumeric + underscore, 2-32 chars
export const SERVICE_RE = /^[a-z0-9_]{2,32}$/;

// Token name — lowercase alphanumeric + underscore/dash, 3-64 chars
export const TOKEN_NAME_RE = /^[a-z0-9_-]{3,64}$/;

// Tag — lowercase slug-safe, starts with alphanumeric, 1-50 chars
export const TAG_RE = /^[a-z0-9][a-z0-9_-]*$/;

// HTTPS URL prefix
export const HTTPS_RE = /^https:\/\/.+/;

// Hex string (lowercase)
export const HEX_RE = /^[a-f0-9]+$/;

// Secret name — alphanumeric + underscore/dash, 1-100 chars (case-insensitive)
export const SECRET_NAME_RE = /^[a-z0-9_-]{1,100}$/i;

// Characters that should never appear in freeform string fields passed to DB
// Blocks: % < > ' " \ ` and control chars (U+0000–U+001F)
export const ILLEGAL_CHARS_RE = /[%<>'"\\`\x00-\x1f]/;

// Max URL length (browsers/servers typically cap around 2048)
export const MAX_URL_LENGTH = 2048;

// Max token value length
export const MAX_TOKEN_VALUE_LENGTH = 8000;
export const MIN_TOKEN_VALUE_LENGTH = 10;

// Max secret value length
export const MAX_SECRET_VALUE_LENGTH = 10000;
