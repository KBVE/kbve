CREATE TABLE `appwrite` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` int,
	`appwrite_endpoint` varchar(256),
	`appwrite_projectid` varchar(256),
	`apppwrite_api_key` varchar(256),
	`version` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appwrite_id` PRIMARY KEY(`id`)
);
