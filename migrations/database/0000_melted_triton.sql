CREATE TABLE `apikey` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` int,
	`permissions` varchar(256),
	`keyhash` varchar(256),
	`label` varchar(256),
	CONSTRAINT `apikey_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appwrite` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` int,
	`appwrite_endpoint` varchar(256),
	`appwrite_projectid` varchar(256),
	`apppwrite_api_key` varchar(256),
	`version` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appwrite_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` int,
	`email` varchar(256),
	`hash` varchar(256) NOT NULL,
	`salt` varchar(256) NOT NULL,
	`password_reset_token` varchar(256),
	`password_reset_expiry` timestamp,
	`verification_token` varchar(256),
	`verification_expiry` timestamp,
	`status` int DEFAULT 0,
	`last_login_at` timestamp,
	`failed_login_attempts` int DEFAULT 0,
	`lockout_until` timestamp,
	`two_factor_secret` varchar(256),
	`recovery_codes` text,
	CONSTRAINT `auth_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `n8n` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` int,
	`webhook` varchar(256),
	`permissions` varchar(256),
	`keyhash` varchar(256),
	`label` varchar(256),
	CONSTRAINT `n8n_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(256) DEFAULT 'Anon',
	`bio` varchar(64) DEFAULT '',
	`unsplash` varchar(64) DEFAULT '',
	`github` varchar(64) DEFAULT '',
	`instagram` varchar(64) DEFAULT '',
	`discord` varchar(64) DEFAULT '',
	`uuid` int,
	CONSTRAINT `profile_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`username` varchar(256),
	`role` int DEFAULT 0,
	`reputation` int DEFAULT 0,
	`exp` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
