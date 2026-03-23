-- OWS Schema: UsersInQueue
SET search_path TO ows;

CREATE TABLE UsersInQueue
(
    CustomerGUID     UUID          NOT NULL,
    UserGUID         UUID          NOT NULL,
    QueueName        VARCHAR(20)   NOT NULL,
    JoinDT           TIMESTAMP     NOT NULL,
    MatchMakingScore INT DEFAULT 0 NOT NULL,
    CONSTRAINT PK_UsersInQueue
        PRIMARY KEY (CustomerGUID, UserGUID, QueueName)
);
