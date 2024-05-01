CREATE TABLE `invoice` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`items` json NOT NULL,
	`paid` decimal(10,2) NOT NULL DEFAULT '0',
	`total` decimal(10,2) NOT NULL,
	`balance` decimal(10,2) NOT NULL,
	`external` varchar(255) NOT NULL DEFAULT '/#',
	`due` bigint unsigned NOT NULL,
	`visibility` int NOT NULL DEFAULT 0,
	`status` int NOT NULL DEFAULT 0,
	CONSTRAINT `invoice_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoice_ulid_unique` UNIQUE(`ulid`)
);
--> statement-breakpoint
ALTER TABLE `invoice` ADD CONSTRAINT `invoice_userid_users_userid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`userid`) ON DELETE no action ON UPDATE no action;