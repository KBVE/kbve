-- migrate:up

-- Lock down direct PostgREST access to mc.proxy_* now that the `mc` schema
-- is exposed via PGRST_DB_SCHEMAS. Browsers reach mc.proxy_* exclusively
-- through public.proxy_* SECURITY DEFINER wrappers (owner = service_role,
-- so the inner mc.* call runs with service_role privileges regardless of
-- the caller's role). Pulling EXECUTE from `authenticated` keeps the schema
-- routable for the Minecraft mod (service_role over Content-Profile: mc)
-- while preventing user-token clients from bypassing the public wrappers.

REVOKE EXECUTE ON FUNCTION mc.proxy_request_link(TEXT)  FROM authenticated;
REVOKE EXECUTE ON FUNCTION mc.proxy_get_link_status()   FROM authenticated;
REVOKE EXECUTE ON FUNCTION mc.proxy_unlink()            FROM authenticated;

-- service_role retains EXECUTE — explicit re-grant for clarity.
GRANT  EXECUTE ON FUNCTION mc.proxy_request_link(TEXT)  TO service_role;
GRANT  EXECUTE ON FUNCTION mc.proxy_get_link_status()   TO service_role;
GRANT  EXECUTE ON FUNCTION mc.proxy_unlink()            TO service_role;

-- mc.service_* functions are already service_role-only; no change needed.

-- migrate:down

-- Restore prior grants so the proxy RPCs are callable by authenticated tokens
-- directly (matches the state before the public wrappers landed).

GRANT EXECUTE ON FUNCTION mc.proxy_request_link(TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_get_link_status()   TO authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_unlink()            TO authenticated;
