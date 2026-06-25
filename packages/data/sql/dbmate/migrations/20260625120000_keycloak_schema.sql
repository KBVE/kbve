-- migrate:up

SET search_path = '';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak') THEN
        CREATE ROLE keycloak NOLOGIN;
    END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS keycloak AUTHORIZATION keycloak;

GRANT ALL ON SCHEMA keycloak TO keycloak;
ALTER DEFAULT PRIVILEGES FOR ROLE keycloak IN SCHEMA keycloak GRANT ALL ON TABLES TO keycloak;
ALTER DEFAULT PRIVILEGES FOR ROLE keycloak IN SCHEMA keycloak GRANT ALL ON SEQUENCES TO keycloak;

-- migrate:down

SET search_path = '';

DROP SCHEMA IF EXISTS keycloak CASCADE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak') THEN
        DROP ROLE keycloak;
    END IF;
END
$$;
