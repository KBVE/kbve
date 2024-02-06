CREATE TABLE `characters` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`cid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`hp` int NOT NULL DEFAULT 0,
	`mp` int NOT NULL DEFAULT 0,
	`ep` int NOT NULL DEFAULT 0,
	`health` int NOT NULL DEFAULT 0,
	`mana` int NOT NULL DEFAULT 0,
	`energy` int NOT NULL DEFAULT 0,
	`armour` int NOT NULL DEFAULT 0,
	`agility` int NOT NULL DEFAULT 0,
	`strength` int NOT NULL DEFAULT 0,
	`intelligence` int NOT NULL DEFAULT 0,
	`name` varchar(255) NOT NULL,
	`description` varchar(255) NOT NULL,
	`experience` int NOT NULL DEFAULT 0,
	`reputation` int NOT NULL DEFAULT 0,
	`faith` int NOT NULL DEFAULT 0,
	CONSTRAINT `characters_id` PRIMARY KEY(`id`),
	CONSTRAINT `characters_cid_unique` UNIQUE(`cid`),
	CONSTRAINT `name_idx` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `characters` ADD CONSTRAINT `characters_userid_users_userid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`userid`) ON DELETE no action ON UPDATE no action;