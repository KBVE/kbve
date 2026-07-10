# OAuth Auto-Username on Sign-In — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a new OAuth sign-in (Discord / GitHub / Twitch, web + mobile), auto-claim the user's provider handle as their KBVE username; if that is impossible, show a friendly "Hey! We need you to create a username?" prompt.

**Architecture:** A new `axum-kbve` endpoint `POST /api/v1/profile/username/auto` resolves the caller's provider handle and claims it via a provider-neutral SQL function (`tracker.ensure_oauth_username`, advisory-locked retry-with-suffix). The `@kbve/core` auth store fires this once per session when a signed-in user has no username; on success it refreshes the session and shows a welcome toast, otherwise the existing `SetUsernameScreen` (RN, rendered on web via `@kbve/rn-astro`) prompts them. Rust username validation is converged to the DB rule so auto-claimed names round-trip.

**Tech Stack:** Rust/axum + PostgREST RPC, PostgreSQL (dbmate migrations), TypeScript (`@kbve/core` store + `@kbve/rn` React Native components), Nx, vitest, cargo test.

## Global Constraints

- **No comments in any new code** (user standing preference). Match existing style otherwise.
- **Converged username rule (Rust + component + DB parity):** `^[a-z0-9_-]{3,63}$`, lowercased, trimmed. Banlist / `xn--` stay enforced by the DB only.
- **Providers:** exactly `discord`, `github`, `twitch`.
- **Exact prompt copy:** `Hey! We need you to create a username?`
- **Exact toast copy:** `Welcome! Your username is @<handle> — change it in settings.` (substitute the claimed handle; em dash `—`).
- **No manual version bumps.** TDD, frequent commits.
- Run all tasks/builds through Nx with the pnpm-scoped CLI: `pnpm nx <target> <project>`.
- Project names: `axum-kbve`, `core`, `rn`. Work happens in the worktree `.claude/worktrees/discord-auto-username` on branch `trunk/discord-auto-username`.

---

### Task 1: Converge Rust `validate_username` to the DB rule

**Files:**
- Modify: `apps/kbve/axum-kbve/src/db/profile.rs:9-77`
- Test: `apps/kbve/axum-kbve/src/db/profile.rs` (new `#[cfg(test)] mod tests` at end of file — the file currently has no tests)

**Interfaces:**
- Produces: `validate_username(&str) -> Result<String, UsernameError>` — now accepts `^[a-z0-9_-]{3,63}$` (hyphen ok, leading digit ok, 3–63), returns lowercased+trimmed. `UsernameError` keeps `TooShort`, `TooLong`, `InvalidCharacters`, `Empty` (drop `MustStartWithLetter`).

- [ ] **Step 1: Write the failing tests**

Append to `apps/kbve/axum-kbve/src/db/profile.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{validate_username, UsernameError};

    #[test]
    fn accepts_hyphen_leading_digit_and_long_names() {
        assert_eq!(validate_username("cool-dude").unwrap(), "cool-dude");
        assert_eq!(validate_username("99bob").unwrap(), "99bob");
        assert_eq!(validate_username("Cool-Dude_99").unwrap(), "cool-dude_99");
        let long = "a".repeat(63);
        assert_eq!(validate_username(&long).unwrap(), long);
    }

    #[test]
    fn rejects_too_short_too_long_and_bad_chars() {
        assert!(matches!(validate_username("ab"), Err(UsernameError::TooShort)));
        assert!(matches!(validate_username(&"a".repeat(64)), Err(UsernameError::TooLong)));
        assert!(matches!(validate_username("bad name"), Err(UsernameError::InvalidCharacters)));
        assert!(matches!(validate_username("bad.name"), Err(UsernameError::InvalidCharacters)));
        assert!(matches!(validate_username("   "), Err(UsernameError::Empty)));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test axum-kbve`
Expected: FAIL — `cool-dude` / `99bob` rejected by the old regex, and `MustStartWithLetter` variant referenced/absent.

- [ ] **Step 3: Rewrite the validator**

Replace `profile.rs:9-17` (regex block):

```rust
static USERNAME_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_username_regex() -> &'static Regex {
    USERNAME_REGEX.get_or_init(|| {
        Regex::new(r"^[a-z0-9_-]{3,63}$").expect("Invalid username regex")
    })
}
```

Replace the `UsernameError` enum (`profile.rs:20-27`) — remove `MustStartWithLetter`:

```rust
#[derive(Debug, Clone)]
pub enum UsernameError {
    TooShort,
    TooLong,
    InvalidCharacters,
    Empty,
}
```

Update its `Display` impl (`profile.rs:29-42`) — drop the `MustStartWithLetter` arm and fix wording:

```rust
impl std::fmt::Display for UsernameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UsernameError::TooShort => write!(f, "Username must be at least 3 characters"),
            UsernameError::TooLong => write!(f, "Username must be at most 63 characters"),
            UsernameError::InvalidCharacters => write!(
                f,
                "Username can only contain lowercase letters, numbers, underscores, and hyphens"
            ),
            UsernameError::Empty => write!(f, "Username cannot be empty"),
        }
    }
}
```

Replace the body of `validate_username` (`profile.rs:46-77`):

```rust
pub fn validate_username(username: &str) -> Result<String, UsernameError> {
    let trimmed = username.trim();

    if trimmed.is_empty() {
        return Err(UsernameError::Empty);
    }

    let lowered = trimmed.to_lowercase();

    if lowered.len() < 3 {
        return Err(UsernameError::TooShort);
    }

    if lowered.len() > 63 {
        return Err(UsernameError::TooLong);
    }

    if !get_username_regex().is_match(&lowered) {
        return Err(UsernameError::InvalidCharacters);
    }

    Ok(lowered)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm nx test axum-kbve`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/axum-kbve/src/db/profile.rs
git commit -m "fix(axum-kbve): converge username validation to DB rule (hyphen, leading digit, 3-63)"
```

---

### Task 2: Provider-neutral SQL claim function `tracker.ensure_oauth_username`

**Files:**
- Create: `packages/data/sql/dbmate/migrations/20260709120000_tracker_ensure_oauth_username.sql`

**Interfaces:**
- Produces: `tracker.ensure_oauth_username(p_user_id UUID, p_base TEXT, p_fallback_id TEXT) RETURNS TEXT` — SECURITY DEFINER, granted to `service_role`, callable as a PostgREST RPC in the `tracker` schema (same exposure as `get_user_all_providers`). Returns the claimed username. Leaves `tracker.ensure_discord_username` untouched.

- [ ] **Step 1: Write the migration**

Create `packages/data/sql/dbmate/migrations/20260709120000_tracker_ensure_oauth_username.sql`:

```sql
-- migrate:up

CREATE OR REPLACE FUNCTION tracker.ensure_oauth_username(
    p_user_id     UUID,
    p_base        TEXT,
    p_fallback_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing  TEXT;
    v_base      TEXT;
    v_candidate TEXT;
    v_suffix    TEXT;
    v_attempt   INT := 0;
BEGIN
    SELECT username INTO v_existing FROM profile.username WHERE user_id = p_user_id;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    v_base := lower(coalesce(p_base, ''));
    v_base := regexp_replace(v_base, '[^a-z0-9_-]', '', 'g');
    IF char_length(v_base) < 3 THEN
        v_base := 'user' || substr(md5(random()::text || coalesce(p_fallback_id, '')), 1, 6);
    END IF;
    v_base := left(v_base, 24);

    LOOP
        v_attempt := v_attempt + 1;
        IF v_attempt = 1 THEN
            v_candidate := v_base;
        ELSE
            v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 4);
            v_candidate := left(v_base, 58 - char_length(v_suffix)) || '-' || v_suffix;
        END IF;

        BEGIN
            PERFORM profile.service_add_username(p_user_id, v_candidate);
            RETURN v_candidate;
        EXCEPTION
            WHEN unique_violation THEN
                IF v_attempt >= 8 THEN
                    RAISE;
                END IF;
            WHEN OTHERS THEN
                IF v_attempt >= 8 THEN
                    RAISE;
                END IF;
        END;
    END LOOP;
END;
$$;

ALTER FUNCTION tracker.ensure_oauth_username(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION tracker.ensure_oauth_username(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tracker.ensure_oauth_username(UUID, TEXT, TEXT) TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS tracker.ensure_oauth_username(UUID, TEXT, TEXT);
```

- [ ] **Step 2: Verify migration syntax parses**

Run: `git diff --stat` and eyeball; if a local dbmate/kilobase is available (see memory `reference_dbmate_local_kilobase`), apply against it. Otherwise defer to CI — do NOT run prod dbmate (user preference: no prod commands).
Expected: file staged, one new function, `ensure_discord_username` unchanged.

- [ ] **Step 3: Commit**

```bash
git add packages/data/sql/dbmate/migrations/20260709120000_tracker_ensure_oauth_username.sql
git commit -m "feat(sql): add tracker.ensure_oauth_username provider-neutral claim"
```

---

### Task 3: Base-handle resolver + `auto_claim_username` service method

**Files:**
- Modify: `apps/kbve/axum-kbve/src/db/profile.rs` (add resolver fn, `AutoClaimResult` struct, and `ProfileService::auto_claim_username`)
- Test: same file `#[cfg(test)] mod tests`

**Interfaces:**
- Consumes: `get_username_by_id` / `get_user_providers` (existing on `ProfileService`), `UserProvider` (existing), PostgREST `rpc_url` + `rpc_headers` (existing on `self.client`).
- Produces:
  - `pub fn resolve_oauth_base(providers: &[UserProvider], hint: Option<&str>) -> Option<(String, String)>` → `(base_handle, fallback_id)`.
  - `pub struct AutoClaimResult { pub username: Option<String>, pub claimed: bool }`.
  - `pub async fn auto_claim_username(&self, user_id: &str, provider_hint: Option<&str>) -> Result<AutoClaimResult, String>`.

- [ ] **Step 1: Write the failing resolver test**

Add to the `mod tests` from Task 1:

```rust
use super::{resolve_oauth_base, UserProvider};
use serde_json::json;

fn prov(provider: &str, id: &str, identity: serde_json::Value) -> UserProvider {
    UserProvider {
        provider: provider.to_string(),
        provider_id: id.to_string(),
        linked_at: None,
        last_sign_in_at: None,
        identity_data: Some(identity),
        email: None,
        username: None,
        avatar_url: None,
    }
}

#[test]
fn resolver_prefers_hint_then_priority() {
    let providers = vec![
        prov("github", "gh1", json!({ "user_name": "octocat" })),
        prov("discord", "dc1", json!({ "global_name": "Cool Guy" })),
    ];
    assert_eq!(
        resolve_oauth_base(&providers, Some("github")),
        Some(("octocat".to_string(), "gh1".to_string()))
    );
    assert_eq!(
        resolve_oauth_base(&providers, None),
        Some(("Cool Guy".to_string(), "dc1".to_string()))
    );
    assert_eq!(resolve_oauth_base(&[], None), None);
}

#[test]
fn resolver_reads_twitch_and_github_fields() {
    let twitch = vec![prov("twitch", "tw1", json!({ "preferred_username": "streamer" }))];
    assert_eq!(
        resolve_oauth_base(&twitch, None),
        Some(("streamer".to_string(), "tw1".to_string()))
    );
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test axum-kbve`
Expected: FAIL — `resolve_oauth_base` not defined.

- [ ] **Step 3: Implement resolver + result struct + service method**

Add near the top of `profile.rs` (after the `validate_username` fn):

```rust
fn provider_base(p: &UserProvider) -> Option<String> {
    if let Some(u) = p.username.clone() {
        if !u.trim().is_empty() {
            return Some(u);
        }
    }
    let d = p.identity_data.as_ref()?;
    let keys: &[&str] = match p.provider.as_str() {
        "discord" => &["global_name", "full_name", "name", "preferred_username", "user_name"],
        "github" => &["user_name", "preferred_username", "name"],
        "twitch" => &["nickname", "preferred_username", "user_name", "name"],
        _ => &["preferred_username", "user_name", "name"],
    };
    for k in keys {
        if let Some(v) = d.get(*k).and_then(|v| v.as_str()) {
            if !v.trim().is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

pub fn resolve_oauth_base(
    providers: &[UserProvider],
    hint: Option<&str>,
) -> Option<(String, String)> {
    let mut order: Vec<&str> = Vec::new();
    if let Some(h) = hint {
        order.push(h);
    }
    for p in ["discord", "github", "twitch"] {
        if !order.contains(&p) {
            order.push(p);
        }
    }
    for name in order {
        if let Some(p) = providers.iter().find(|p| p.provider == name) {
            if let Some(base) = provider_base(p) {
                return Some((base, p.provider_id.clone()));
            }
        }
    }
    None
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AutoClaimResult {
    pub username: Option<String>,
    pub claimed: bool,
}
```

Add this method inside `impl ProfileService` (e.g. after `set_username`):

```rust
pub async fn auto_claim_username(
    &self,
    user_id: &str,
    provider_hint: Option<&str>,
) -> Result<AutoClaimResult, String> {
    if let Some(existing) = self.get_username_by_id(user_id).await? {
        return Ok(AutoClaimResult { username: Some(existing), claimed: false });
    }

    let providers = self.get_user_providers(user_id).await?;
    let (base, fallback_id) = match resolve_oauth_base(&providers, provider_hint) {
        Some(pair) => pair,
        None => return Ok(AutoClaimResult { username: None, claimed: false }),
    };

    let url = self.client.config().rpc_url("ensure_oauth_username");
    let headers = self.client.rpc_headers("tracker")?;
    let payload = serde_json::json!({
        "p_user_id": user_id,
        "p_base": base,
        "p_fallback_id": fallback_id,
    });

    let response = self
        .client
        .client()
        .post(&url)
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Database error: {} - {}", status, body));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if text.is_empty() || text == "null" {
        return Ok(AutoClaimResult { username: None, claimed: false });
    }

    let username: String = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse username: {} (response: {})", e, text))?;

    tracing::info!("Auto-claimed username '{}' for user {}", username, user_id);
    Ok(AutoClaimResult { username: Some(username), claimed: true })
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm nx test axum-kbve`
Expected: PASS (resolver tests; the async method is exercised in Task 4 / integration).

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/axum-kbve/src/db/profile.rs
git commit -m "feat(axum-kbve): oauth base-handle resolver + auto_claim_username service"
```

---

### Task 4: `POST /api/v1/profile/username/auto` route + handler

**Files:**
- Modify: `apps/kbve/axum-kbve/src/transport/https.rs` — add `AutoClaimRequest` struct near `SetUsernameRequest` (`~:168`), add `auto_claim_username_handler` after `set_username_handler` (`~:2129`), register route after `:293`.

**Interfaces:**
- Consumes: `ProfileService::auto_claim_username` (Task 3), `extract_request_token`, `get_jwt_cache`, `get_profile_service` (existing).
- Produces: route `POST /api/v1/profile/username/auto`; JSON response `{ "claimed": bool, "username": string|null }`.

- [ ] **Step 1: Add the request struct**

Near `SetUsernameRequest` (`https.rs:168`):

```rust
#[derive(Debug, Deserialize, ToSchema)]
pub(crate) struct AutoClaimRequest {
    #[serde(default)]
    pub provider: Option<String>,
}
```

- [ ] **Step 2: Add the handler**

After `set_username_handler` ends (`https.rs:2129`):

```rust
#[utoipa::path(
    post,
    path = "/api/v1/profile/username/auto",
    tag = "profile",
    request_body = AutoClaimRequest,
    responses(
        (status = 200, description = "Auto-claim attempted", body = serde_json::Value),
        (status = 401, description = "Missing / invalid / expired token"),
        (status = 503, description = "Auth or profile service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn auto_claim_username_handler(
    headers: HeaderMap,
    Json(body): Json<AutoClaimRequest>,
) -> impl IntoResponse {
    let token = match extract_request_token(&headers) {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Missing authentication" })),
            )
                .into_response();
        }
    };
    let token = token.as_str();

    let jwt_cache = match get_jwt_cache() {
        Some(cache) => cache,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": "Authentication service unavailable" })),
            )
                .into_response();
        }
    };

    let token_info = match jwt_cache.verify_and_cache(token).await {
        Ok(info) => info,
        Err(_) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Invalid token" })),
            )
                .into_response();
        }
    };

    let profile_service = match get_profile_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": "Profile service unavailable" })),
            )
                .into_response();
        }
    };

    let provider = body.provider.as_deref().filter(|p| {
        matches!(*p, "discord" | "github" | "twitch")
    });

    match profile_service
        .auto_claim_username(&token_info.user_id, provider)
        .await
    {
        Ok(result) => (
            StatusCode::OK,
            Json(json!({
                "claimed": result.claimed,
                "username": result.username,
            })),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!(user_id = %token_info.user_id, error = %e, "Auto-claim failed");
            (
                StatusCode::OK,
                Json(json!({ "claimed": false, "username": null })),
            )
                .into_response()
        }
    }
}
```

- [ ] **Step 3: Register the route**

After `https.rs:293` (`.route("/api/v1/profile/username", post(set_username_handler))`):

```rust
        .route("/api/v1/profile/username/auto", post(auto_claim_username_handler))
```

If there is a central `utoipa` `paths(...)` registration list, add `auto_claim_username_handler` alongside `set_username_handler` (search the file for `set_username_handler` in a `paths(` macro and mirror it).

- [ ] **Step 4: Build to verify it compiles**

Run: `pnpm nx build axum-kbve`
Expected: compiles; no unused-import/type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/axum-kbve/src/transport/https.rs
git commit -m "feat(axum-kbve): POST /api/v1/profile/username/auto endpoint"
```

---

### Task 5: `@kbve/core` auth store — fire auto-claim once per session

**Files:**
- Modify: `packages/npm/core/src/auth.ts`
- Test: `packages/npm/core/src/__tests__/auth.test.ts` (create)

**Interfaces:**
- Produces:
  - `AuthState` gains `autoClaimAttempted: boolean` and `lastProvider: OAuthProvider | null`.
  - `AuthEffect` gains `{ type: 'api.auto_claim_username'; provider: OAuthProvider | null }`.
  - Reducer emits that effect exactly once when transitioning to signed-in with `username === null` and `autoClaimAttempted === false`.

- [ ] **Step 1: Write the failing reducer test**

Create `packages/npm/core/src/__tests__/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { authCore } from '../auth';
import type { AuthSession } from '../auth';

function session(username: string | null): AuthSession {
	return {
		accessToken: 'a',
		refreshToken: 'r',
		expiresAt: null,
		user: { id: 'u1', email: 'e@x.io', username },
	};
}

describe('auth auto-claim', () => {
	it('emits api.auto_claim_username once when signed in without a username', () => {
		const s0 = authCore.initial();
		const r1 = authCore.update(s0, { type: 'restored', session: session(null) });
		expect(r1.effects).toContainEqual({
			type: 'api.auto_claim_username',
			provider: null,
		});
		expect(r1.state.autoClaimAttempted).toBe(true);

		const r2 = authCore.update(r1.state, {
			type: 'session_changed',
			session: session(null),
		});
		expect(r2.effects).not.toContainEqual(
			expect.objectContaining({ type: 'api.auto_claim_username' }),
		);
	});

	it('does not auto-claim when a username already exists', () => {
		const s0 = authCore.initial();
		const r = authCore.update(s0, { type: 'restored', session: session('bob') });
		expect(r.effects).toEqual([]);
	});

	it('remembers the sign-in provider as the hint', () => {
		let s = authCore.initial();
		s = authCore.update(s, { type: 'sign_in_oauth', provider: 'github' }).state;
		const r = authCore.update(s, { type: 'restored', session: session(null) });
		expect(r.effects).toContainEqual({
			type: 'api.auto_claim_username',
			provider: 'github',
		});
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test core`
Expected: FAIL — `autoClaimAttempted` undefined, effect not emitted.
(If `core` has no `test` target, run `pnpm vitest run packages/npm/core/src/__tests__/auth.test.ts` from the repo root; confirm the target first with `pnpm nx show project core --json | grep test`.)

- [ ] **Step 3: Extend state, effects, and reducer**

In `packages/npm/core/src/auth.ts`:

Extend `AuthState` (after `error`):

```ts
export interface AuthState {
	status: AuthStatus;
	user: AuthUser | null;
	session: AuthSession | null;
	error: string | null;
	autoClaimAttempted: boolean;
	lastProvider: OAuthProvider | null;
}
```

Extend `initialAuthState`:

```ts
export const initialAuthState: AuthState = {
	status: 'loading',
	user: null,
	session: null,
	error: null,
	autoClaimAttempted: false,
	lastProvider: null,
};
```

Add to `AuthEffect` union:

```ts
	| { type: 'api.auto_claim_username'; provider: OAuthProvider | null }
```

Replace the `signedIn` helper and add an auto-claim helper:

```ts
function signedIn(state: AuthState, session: AuthSession): AuthState {
	return {
		status: 'signed_in',
		user: session.user,
		session,
		error: null,
		autoClaimAttempted: state.autoClaimAttempted,
		lastProvider: state.lastProvider,
	};
}

function withAutoClaim(
	next: AuthState,
): UpdateResult<AuthState, AuthEffect> {
	const noUsername = next.user?.username == null;
	if (next.status === 'signed_in' && noUsername && !next.autoClaimAttempted) {
		return {
			state: { ...next, autoClaimAttempted: true },
			effects: [
				{ type: 'api.auto_claim_username', provider: next.lastProvider },
			],
		};
	}
	return { state: next, effects: [] };
}
```

Update the `restored` and `session_changed` cases to route through `withAutoClaim`:

```ts
		case 'restored':
			return event.session
				? withAutoClaim(signedIn(state, event.session))
				: {
						state: {
							...initialAuthState,
							status: 'signed_out',
						},
						effects: [],
					};
```

```ts
		case 'session_changed':
			return event.session
				? withAutoClaim(signedIn(state, event.session))
				: {
						state: {
							...initialAuthState,
							status: 'signed_out',
						},
						effects: [],
					};
```

Update `sign_in_oauth` to record the provider hint:

```ts
		case 'sign_in_oauth':
			return {
				state: {
					...state,
					status: 'authenticating',
					error: null,
					lastProvider: event.provider,
				},
				effects: [
					{ type: 'supabase.sign_in_oauth', provider: event.provider },
				],
			};
```

Update `sign_out` to reset the flags (replace its `state` object):

```ts
		case 'sign_out':
			return {
				state: { ...initialAuthState, status: 'signed_out' },
				effects: [{ type: 'supabase.sign_out' }],
			};
```

(The other `signedIn(event.session)` call sites are now `signedIn(state, event.session)` — only `restored` and `session_changed` used it; both updated above.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm nx test core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/core/src/auth.ts packages/npm/core/src/__tests__/auth.test.ts
git commit -m "feat(core): fire auto_claim_username once per session with provider hint"
```

---

### Task 6: RN executors handle `api.auto_claim_username` + welcome toast

**Files:**
- Modify: `packages/npm/rn/src/auth/executor.web.ts`
- Modify: `packages/npm/rn/src/auth/executor.ts`

**Interfaces:**
- Consumes: `AuthEffect` (now includes `api.auto_claim_username`), `request` from `@kbve/core`, `KBVE_API_URL`, `mapSession`, `toastStore`.
- Produces: on `claimed === true`, pushes the welcome toast and dispatches `session_changed` with the refreshed session; on failure, dispatches nothing (leaves `needsUsername` true).

- [ ] **Step 1: Add the effect handler to `executor.web.ts`**

Add import at top of `packages/npm/rn/src/auth/executor.web.ts`:

```ts
import { toastStore } from '../ui/state/toastStore';
```

Add this `case` inside the `switch (effect.type)` (after `api.set_username`):

```ts
				case 'api.auto_claim_username':
					void (async () => {
						const { data } = await client.auth.getSession();
						const token = data.session?.access_token;
						if (!token) return;
						const result = await request<{
							claimed: boolean;
							username: string | null;
						}>(`${KBVE_API_URL}/api/v1/profile/username/auto`, {
							method: 'POST',
							headers: { Authorization: `Bearer ${token}` },
							body: { provider: effect.provider ?? undefined },
							timeoutMs: 10000,
						});
						if (
							!result.ok ||
							!result.data?.claimed ||
							!result.data.username
						) {
							return;
						}
						toastStore.push(
							`Welcome! Your username is @${result.data.username} — change it in settings.`,
							'success',
						);
						const { data: refreshed } =
							await client.auth.refreshSession();
						dispatch({
							type: 'session_changed',
							session: mapSession(refreshed.session),
						});
					})();
					break;
```

- [ ] **Step 2: Add the identical handler to `executor.ts` (native)**

Add the same import and the same `case 'api.auto_claim_username':` block (identical body) into `packages/npm/rn/src/auth/executor.ts`'s switch, after its `api.set_username` case. `request`, `KBVE_API_URL`, `mapSession` are already imported there; add `import { toastStore } from '../ui/state/toastStore';`.

- [ ] **Step 3: Typecheck / build**

Run: `pnpm nx lint rn && pnpm nx build rn`
Expected: no type errors — the `effect.provider` field is now known from the `AuthEffect` union (Task 5).

- [ ] **Step 4: Commit**

```bash
git add packages/npm/rn/src/auth/executor.web.ts packages/npm/rn/src/auth/executor.ts
git commit -m "feat(rn): execute auto_claim_username effect + welcome toast"
```

---

### Task 7: `SetUsernameScreen` — converged rule, friendly copy, suggestion + modal variant; wire into AuthGate

**Files:**
- Modify: `packages/npm/rn/src/auth/SetUsernameScreen.tsx`
- Modify: `packages/npm/rn/src/auth/AuthGate.tsx`
- Test: `packages/npm/rn/src/auth/__tests__/SetUsernameScreen.test.tsx` (create)

**Interfaces:**
- Consumes: `useAuth`, `useAuthActions` (existing).
- Produces: `SetUsernameScreen(props?: { title?: string; subtitle?: string; suggestion?: string; variant?: 'screen' | 'modal' })`. Default title `Pick a username`; when used as the post-auto-claim prompt, callers pass `title="Hey! We need you to create a username?"`. Validation uses the converged regex.

- [ ] **Step 1: Write the failing component test**

Create `packages/npm/rn/src/auth/__tests__/SetUsernameScreen.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SetUsernameScreen } from '../SetUsernameScreen';

// Minimal Kbve context is provided by the shared test harness; see droidStorage.test.ts for the pattern.
describe('SetUsernameScreen', () => {
	it('renders the provided title and pre-fills the suggestion', () => {
		render(
			<SetUsernameScreen
				title="Hey! We need you to create a username?"
				suggestion="octocat"
			/>,
		);
		expect(
			screen.getByText('Hey! We need you to create a username?'),
		).toBeTruthy();
		expect(screen.getByDisplayValue('octocat')).toBeTruthy();
	});
});
```

Note: if the existing rn test harness requires a `KbveProvider` wrapper for `useAuth`, wrap the render exactly as `droidStorage.test.ts` / any existing auth test does. Inspect `packages/npm/rn/src/auth/__tests__/` for the established wrapper before running.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test rn`
Expected: FAIL — `SetUsernameScreen` takes no props / no suggestion prefill.

- [ ] **Step 3: Update the component**

Rewrite `packages/npm/rn/src/auth/SetUsernameScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, View } from 'react-native';
import { Button, Text, tokens } from '../ui';
import { useAuth, useAuthActions } from './useAuth';

const USERNAME_RE = /^[a-z0-9_-]{3,63}$/;

export interface SetUsernameScreenProps {
	title?: string;
	subtitle?: string;
	suggestion?: string;
	variant?: 'screen' | 'modal';
}

export function SetUsernameScreen({
	title = 'Pick a username',
	subtitle = 'Your public KBVE handle — kbve.com/@you',
	suggestion = '',
	variant = 'screen',
}: SetUsernameScreenProps = {}) {
	const auth = useAuth();
	const { setUsername, signOut } = useAuthActions();
	const [value, setValue] = useState(suggestion);
	const [submitting, setSubmitting] = useState(false);
	const trimmed = value.trim().toLowerCase();
	const valid = USERNAME_RE.test(trimmed);
	const showError = trimmed.length > 0 && !valid;

	useEffect(() => {
		if (auth.error) setSubmitting(false);
	}, [auth.error]);

	const submit = () => {
		if (!valid) return;
		setSubmitting(true);
		setUsername(trimmed);
	};

	const body = (
		<View style={styles.container}>
			<View style={styles.hero}>
				<Text variant="display">{title}</Text>
				<Text variant="body" tone="muted">
					{subtitle}
				</Text>
			</View>

			<View style={styles.field}>
				<Text variant="subtitle" tone="faint">
					@
				</Text>
				<TextInput
					style={styles.input}
					placeholder="username"
					placeholderTextColor={tokens.color.textFaint}
					autoCapitalize="none"
					autoCorrect={false}
					autoFocus
					value={value}
					onChangeText={setValue}
					editable={!submitting}
				/>
			</View>
			<Text
				variant="caption"
				tone={showError ? 'danger' : 'faint'}
				style={styles.hint}>
				3–63 characters: lowercase letters, numbers, underscores, hyphens.
			</Text>

			<Button
				title="Continue"
				disabled={!valid || submitting}
				loading={submitting}
				onPress={submit}
				style={styles.submit}
			/>
			{auth.error ? (
				<Text variant="caption" tone="danger" style={styles.serverError}>
					{auth.error}
				</Text>
			) : null}

			<Button
				title="Sign out"
				variant="ghost"
				onPress={signOut}
				style={styles.signout}
			/>
		</View>
	);

	if (variant === 'modal') {
		return (
			<Modal transparent animationType="fade" visible>
				<View style={styles.backdrop}>
					<View style={styles.card}>{body}</View>
				</View>
			</Modal>
		);
	}

	return body;
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.color.bg,
		justifyContent: 'center',
		paddingHorizontal: tokens.space.xl,
		gap: tokens.space.lg,
	},
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		paddingHorizontal: tokens.space.lg,
	},
	card: {
		backgroundColor: tokens.color.bg,
		borderRadius: tokens.radius.lg,
		borderWidth: 1,
		borderColor: tokens.color.border,
		overflow: 'hidden',
		maxHeight: '80%',
	},
	hero: {
		alignItems: 'center',
		gap: tokens.space.xs,
		marginBottom: tokens.space.md,
	},
	field: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		backgroundColor: tokens.color.surface,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
		paddingHorizontal: tokens.space.lg,
	},
	input: {
		flex: 1,
		color: tokens.color.text,
		paddingVertical: tokens.space.md,
		fontSize: tokens.font.body,
	},
	hint: { textAlign: 'center' },
	submit: { marginTop: tokens.space.xs },
	serverError: { textAlign: 'center' },
	signout: { marginTop: tokens.space.md },
});
```

Note: if `tokens.radius.lg` does not exist, use `tokens.radius.md` (verify against `packages/npm/rn/src/ui/theme.ts`).

- [ ] **Step 4: Point AuthGate at the friendly copy**

In `packages/npm/rn/src/auth/AuthGate.tsx`, replace the `needsUsername` branch:

```tsx
	if (auth.needsUsername) {
		return (
			<SetUsernameScreen title="Hey! We need you to create a username?" />
		);
	}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm nx test rn`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/npm/rn/src/auth/SetUsernameScreen.tsx packages/npm/rn/src/auth/AuthGate.tsx packages/npm/rn/src/auth/__tests__/SetUsernameScreen.test.tsx
git commit -m "feat(rn): friendly username prompt copy, converged rule, suggestion + modal variant"
```

---

### Task 8: Full verification + PR

**Files:** none (verification + PR).

- [ ] **Step 1: Run the full affected suite**

```bash
pnpm nx run-many -t test lint build --projects axum-kbve,core,rn
```
Expected: all green. Fix any failures before proceeding.

- [ ] **Step 2: Drive the flow end-to-end (verify skill)**

Use the `verify` skill against astro-kbve's account island (RN-on-web bridge). With a fresh Discord/GitHub/Twitch test account that has no username:
- Confirm a username is auto-assigned silently and the welcome toast appears.
- Confirm the `@handle` matches the provider handle (or a suffixed variant on collision).
- With an email-only account (no provider handle), confirm the "Hey! We need you to create a username?" prompt appears and a manually-entered hyphenated name (e.g. `cool-dude`) is accepted.
Capture what was observed (screenshots / console) per the verify skill.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin trunk/discord-auto-username
gh pr create --base dev --title "feat(auth): auto-username on OAuth sign-in (discord/github/twitch)" --body "$(cat <<'EOF'
## Summary
- Auto-claim the user's provider handle (Discord/GitHub/Twitch) as their KBVE username on first sign-in; silent + welcome toast on success.
- Friendly "Hey! We need you to create a username?" prompt (RN-first, web via @kbve/rn-astro) only when no handle is available.
- New `POST /api/v1/profile/username/auto` + provider-neutral `tracker.ensure_oauth_username` (advisory-locked retry-with-suffix).
- Converged Rust username validation to the DB rule so auto-claimed names round-trip.

## Spec / Plan
- docs/superpowers/specs/2026-07-09-discord-auto-username-design.md
- docs/superpowers/plans/2026-07-09-oauth-auto-username.md

## Test plan
- cargo tests: validator parity, base-handle resolver.
- vitest: auth store fires auto-claim once with provider hint; SetUsernameScreen renders copy + suggestion.
- Manual: end-to-end auto-claim + toast + fallback prompt.
EOF
)"
```

Base the PR on `dev` (repo convention: PRs land on dev). Do NOT push to dev/main directly.

---

## Self-Review

**Spec coverage:**
- Validation parity → Task 1. ✓
- Provider-neutral SQL claim → Task 2. ✓
- Multi-provider base resolution + endpoint → Tasks 3, 4. ✓
- Fire-once client wiring + provider hint → Task 5. ✓
- Welcome toast + refresh on success → Task 6. ✓
- Friendly prompt copy + modal/suggestion + converged component regex → Task 7. ✓
- Testing + end-to-end verify + PR → Task 8. ✓

**Type consistency:** `AutoClaimResult { username, claimed }` (Rust) ↔ response `{ claimed, username }` ↔ client `request<{ claimed; username }>`. `api.auto_claim_username` effect defined in Task 5, consumed in Task 6. `resolve_oauth_base` signature identical across Tasks 3 tests + impl. `SetUsernameScreenProps` defined + consumed (AuthGate) in Task 7.

**Placeholder scan:** none — every code step has full content. Two explicit "verify against existing code" notes (utoipa `paths(` list; `tokens.radius.lg`; rn test-harness wrapper) are guardrails, not deferred work.

**Open dependency:** Task 2's migration must be applied to the DB before Task 4's endpoint works at runtime (dbmate deploy via CI, not prod-manual). Tasks otherwise land independently.
```
