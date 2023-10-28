CREATE TABLE `profile` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(256) DEFAULT 'Anon',
	`bio` varchar(64) DEFAULT '',
	`unsplash` varchar(64) DEFAULT '',
	`github` varchar(64) DEFAULT '',
	`instagram` varchar(64) DEFAULT '',
	`discord` varchar(64) DEFAULT '',
	`uuid` int NOT NULL,
	CONSTRAINT `profile_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `profile` ADD CONSTRAINT `profile_uuid_users_id_fk` FOREIGN KEY (`uuid`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;