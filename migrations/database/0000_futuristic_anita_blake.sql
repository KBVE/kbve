CREATE TABLE `apikey` (
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`permissions` varchar(256) NOT NULL,
	`keyhash` varchar(256) NOT NULL,
	`label` varchar(256) NOT NULL,
	CONSTRAINT `apikey_ulid` PRIMARY KEY(`ulid`),
	CONSTRAINT `keyhash_idx` UNIQUE(`keyhash`)
);
--> statement-breakpoint
CREATE TABLE `appwrite` (
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`appwrite_endpoint` varchar(256) NOT NULL,
	`appwrite_projectid` varchar(256) NOT NULL,
	`appwrite_api_key` varchar(256) NOT NULL,
	`version` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appwrite_ulid` PRIMARY KEY(`ulid`),
	CONSTRAINT `appwrite_api_key_idx` UNIQUE(`appwrite_api_key`)
);
--> statement-breakpoint
CREATE TABLE `auth` (
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`email` varchar(256) NOT NULL,
	`hash` varchar(256) NOT NULL,
	`salt` varchar(256) NOT NULL,
	`password_reset_token` varchar(256) NOT NULL,
	`password_reset_expiry` timestamp NOT NULL,
	`verification_token` varchar(256) NOT NULL,
	`verification_expiry` timestamp NOT NULL,
	`status` int NOT NULL DEFAULT 0,
	`last_login_at` timestamp NOT NULL,
	`failed_login_attempts` int NOT NULL DEFAULT 0,
	`lockout_until` timestamp NOT NULL,
	`two_factor_secret` varchar(256) NOT NULL,
	`recovery_codes` text NOT NULL,
	CONSTRAINT `auth_ulid` PRIMARY KEY(`ulid`),
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
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`webhook` varchar(256) NOT NULL,
	`permissions` varchar(256) NOT NULL,
	`keyhash` varchar(256) NOT NULL,
	`label` varchar(256) NOT NULL,
	CONSTRAINT `n8n_ulid` PRIMARY KEY(`ulid`),
	CONSTRAINT `keyhash_idx` UNIQUE(`keyhash`)
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`ulid` binary(16) NOT NULL,
	`name` varchar(256) NOT NULL DEFAULT 'Anon',
	`bio` varchar(64) NOT NULL DEFAULT '',
	`unsplash` varchar(64) NOT NULL DEFAULT '',
	`github` varchar(64) NOT NULL DEFAULT '',
	`instagram` varchar(64) NOT NULL DEFAULT '',
	`discord` varchar(64) NOT NULL DEFAULT '',
	`userid` binary(16) NOT NULL,
	CONSTRAINT `profile_ulid` PRIMARY KEY(`ulid`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`ulid` binary(16) NOT NULL,
	`userid` binary(16) NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` varchar(255) NOT NULL,
	CONSTRAINT `settings_ulid` PRIMARY KEY(`ulid`),
	CONSTRAINT `key_idx` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`ulid` binary(16) NOT NULL,
	`username` varchar(256) NOT NULL,
	`role` int NOT NULL DEFAULT 0,
	`reputation` int NOT NULL DEFAULT 0,
	`exp` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_ulid` PRIMARY KEY(`ulid`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `username_idx` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `apikey` ADD CONSTRAINT `apikey_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appwrite` ADD CONSTRAINT `appwrite_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth` ADD CONSTRAINT `auth_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `n8n` ADD CONSTRAINT `n8n_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `profile` ADD CONSTRAINT `profile_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settings` ADD CONSTRAINT `settings_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;