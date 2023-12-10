CREATE TABLE `apikey` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` bigint unsigned NOT NULL,
	`permissions` varchar(256) NOT NULL,
	`keyhash` varchar(256) NOT NULL,
	`label` varchar(256) NOT NULL,
	CONSTRAINT `apikey_id` PRIMARY KEY(`id`),
	CONSTRAINT `uuid_idx` UNIQUE(`uuid`),
	CONSTRAINT `keyhash_idx` UNIQUE(`keyhash`)
);
--> statement-breakpoint
CREATE TABLE `appwrite` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` bigint unsigned NOT NULL,
	`appwrite_endpoint` varchar(256) NOT NULL,
	`appwrite_projectid` varchar(256) NOT NULL,
	`appwrite_api_key` varchar(256) NOT NULL,
	`version` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appwrite_id` PRIMARY KEY(`id`),
	CONSTRAINT `uuid_idx` UNIQUE(`uuid`),
	CONSTRAINT `appwrite_api_key_idx` UNIQUE(`appwrite_api_key`)
);
--> statement-breakpoint
CREATE TABLE `auth` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` bigint unsigned NOT NULL,
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
	CONSTRAINT `auth_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_email_unique` UNIQUE(`email`),
	CONSTRAINT `uuid_idx` UNIQUE(`uuid`),
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
	`uuid` bigint unsigned NOT NULL,
	`webhook` varchar(256) NOT NULL,
	`permissions` varchar(256) NOT NULL,
	`keyhash` varchar(256) NOT NULL,
	`label` varchar(256) NOT NULL,
	CONSTRAINT `n8n_id` PRIMARY KEY(`id`),
	CONSTRAINT `uuid_idx` UNIQUE(`uuid`)
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL DEFAULT 'Anon',
	`bio` varchar(64) NOT NULL DEFAULT '',
	`unsplash` varchar(64) NOT NULL DEFAULT '',
	`github` varchar(64) NOT NULL DEFAULT '',
	`instagram` varchar(64) NOT NULL DEFAULT '',
	`discord` varchar(64) NOT NULL DEFAULT '',
	`uuid` bigint unsigned NOT NULL,
	CONSTRAINT `profile_id` PRIMARY KEY(`id`),
	CONSTRAINT `uuid_idx` UNIQUE(`uuid`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`uuid` bigint unsigned NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` varchar(255) NOT NULL,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `key_idx` UNIQUE(`key`),
	CONSTRAINT `uuid_idx` UNIQUE(`uuid`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`username` varchar(256) NOT NULL,
	`role` int NOT NULL DEFAULT 0,
	`reputation` int NOT NULL DEFAULT 0,
	`exp` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `username_idx` UNIQUE(`username`)
);
