CREATE TABLE `apikey` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` int,
	`permissions` json,
	`keyhash` varchar(256),
	`label` varchar(256),
	CONSTRAINT `apikey_id` PRIMARY KEY(`id`)
);
