-- OWS Schema: ChatGroups
SET search_path TO ows;

CREATE TABLE ChatGroups
(
    CustomerGUID  UUID        NOT NULL,
    ChatGroupID   SERIAL      NOT NULL,
    ChatGroupName VARCHAR(50) NOT NULL,
    CONSTRAINT PK_ChatGroups
        PRIMARY KEY (CustomerGUID, ChatGroupID)
);

-- Security: ChatGroups
ALTER TABLE ChatGroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ChatGroups FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ChatGroups FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatGroups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ChatGroups TO ows;
