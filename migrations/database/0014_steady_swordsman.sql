CREATE TABLE `n8n` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` int,
	`webhook` varchar(256),
	`permissions` json,
	`keyhash` varchar(256),
	`label` varchar(256),
	CONSTRAINT `n8n_id` PRIMARY KEY(`id`)
);
