CREATE TABLE `apikey` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`permissions` varchar(255) NOT NULL,
	`keyhash` varchar(255) NOT NULL,
	`label` varchar(255) NOT NULL,
	CONSTRAINT `apikey_id` PRIMARY KEY(`id`),
	CONSTRAINT `apikey_ulid_unique` UNIQUE(`ulid`),
	CONSTRAINT `keyhash_idx` UNIQUE(`keyhash`)
);
--> statement-breakpoint
CREATE TABLE `appwrite` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`appwrite_endpoint` varchar(255) NOT NULL,
	`appwrite_projectid` varchar(255) NOT NULL,
	`appwrite_api_key` varchar(255) NOT NULL,
	`version` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appwrite_id` PRIMARY KEY(`id`),
	CONSTRAINT `appwrite_ulid_unique` UNIQUE(`ulid`),
	CONSTRAINT `appwrite_api_key_idx` UNIQUE(`appwrite_api_key`)
);
--> statement-breakpoint
CREATE TABLE `auth` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`email` varchar(255) NOT NULL,
	`hash` varchar(255) NOT NULL,
	`salt` varchar(255) NOT NULL,
	`password_reset_token` varchar(255) NOT NULL,
	`password_reset_expiry` timestamp NOT NULL,
	`verification_token` varchar(255) NOT NULL,
	`verification_expiry` timestamp NOT NULL,
	`status` int NOT NULL DEFAULT 0,
	`last_login_at` timestamp NOT NULL,
	`failed_login_attempts` int NOT NULL DEFAULT 0,
	`lockout_until` timestamp NOT NULL,
	`two_factor_secret` varchar(255) NOT NULL,
	`recovery_codes` text NOT NULL,
	CONSTRAINT `auth_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_ulid_unique` UNIQUE(`ulid`),
	CONSTRAINT `auth_email_unique` UNIQUE(`email`),
	CONSTRAINT `email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `globals` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` varchar(255) NOT NULL,
	CONSTRAINT `globals_id` PRIMARY KEY(`id`),
	CONSTRAINT `key_idx` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `n8n` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`webhook` varchar(255) NOT NULL,
	`permissions` varchar(255) NOT NULL,
	`keyhash` varchar(255) NOT NULL,
	`label` varchar(255) NOT NULL,
	CONSTRAINT `n8n_id` PRIMARY KEY(`id`),
	CONSTRAINT `n8n_ulid_unique` UNIQUE(`ulid`),
	CONSTRAINT `keyhash_idx` UNIQUE(`keyhash`)
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ulid` binary(16) NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT 'Anon',
	`bio` varchar(64) NOT NULL DEFAULT '',
	`unsplash` varchar(64) NOT NULL DEFAULT '',
	`github` varchar(64) NOT NULL DEFAULT '',
	`instagram` varchar(64) NOT NULL DEFAULT '',
	`discord` varchar(64) NOT NULL DEFAULT '',
	`userid` binary(16) NOT NULL,
	CONSTRAINT `profile_id` PRIMARY KEY(`id`),
	CONSTRAINT `profile_ulid_unique` UNIQUE(`ulid`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` varchar(255) NOT NULL,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_ulid_unique` UNIQUE(`ulid`),
	CONSTRAINT `key_idx` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userid` binary(16) NOT NULL,
	`username` varchar(255) NOT NULL,
	`role` int NOT NULL DEFAULT 0,
	`reputation` int NOT NULL DEFAULT 0,
	`exp` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_userid_unique` UNIQUE(`userid`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `username_idx` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `apikey` ADD CONSTRAINT `apikey_userid_users_userid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`userid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appwrite` ADD CONSTRAINT `appwrite_userid_users_userid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`userid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth` ADD CONSTRAINT `auth_userid_users_userid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`userid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `n8n` ADD CONSTRAINT `n8n_userid_users_userid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`userid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `profile` ADD CONSTRAINT `profile_userid_users_userid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`userid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settings` ADD CONSTRAINT `settings_userid_users_userid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`userid`) ON DELETE no action ON UPDATE no action;