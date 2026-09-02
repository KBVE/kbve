/**
 * Environment variable loading and validation.
 *
 * Fails fast at worker boot with a clear message listing every missing variable
 * instead of surfacing a cryptic `undefined` deep inside a handler. Also
 * validates JWT secret strength so a weak/short secret is caught at startup.
 */

/** Minimum acceptable JWT secret length (HS256 keys should be >= 32 bytes). */
export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Read and validate all required env vars at startup.
 * Throws a single error naming every missing variable.
 */
export function loadEnv<K extends string>(
  required: readonly K[],
): Record<K, string> {
  const out = {} as Record<K, string>;
  const missing: string[] = [];
  for (const key of required) {
    const value = Deno.env.get(key);
    if (value === undefined || value === "") {
      missing.push(key);
    } else {
      out[key] = value;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
  return out;
}

/**
 * Validate a JWT secret for minimum strength. Throws when the secret is missing
 * or shorter than MIN_JWT_SECRET_LENGTH.
 */
export function validateJwtSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is too weak: must be at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );
  }
  return secret;
}
