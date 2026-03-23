-- OWS Schema: Customers
SET search_path TO ows;

CREATE TABLE Customers
(
    CustomerGUID       UUID        DEFAULT gen_random_uuid() NOT NULL
        CONSTRAINT PK_Customers
            PRIMARY KEY,
    CustomerName       VARCHAR(50)                           NOT NULL,
    CustomerEmail      VARCHAR(255)                          NOT NULL,
    CustomerPhone      VARCHAR(20),
    CustomerNotes      TEXT,
    EnableDebugLogging BOOLEAN         DEFAULT FALSE            NOT NULL,
    EnableAutoLoopBack BOOLEAN         DEFAULT TRUE            NOT NULL,
    DeveloperPaid      BOOLEAN         DEFAULT FALSE            NOT NULL,
    PublisherPaidDate  TIMESTAMP,
    StripeCustomerID   VARCHAR(50) DEFAULT ''                NOT NULL,
    FreeTrialStarted   TIMESTAMP,
    SupportUnicode     BOOLEAN         DEFAULT FALSE            NOT NULL,
    CreateDate         TIMESTAMP   DEFAULT NOW()             NOT NULL,
    NoPortForwarding   BOOLEAN         DEFAULT FALSE            NOT NULL
);

-- Security: Customers
ALTER TABLE Customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE Customers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON Customers FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON Customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON Customers TO ows;
