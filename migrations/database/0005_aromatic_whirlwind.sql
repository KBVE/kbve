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
	`status` enum('Active','Suspended','Pending') DEFAULT 'Pending',
	`last_login_at` timestamp,
	`failed_login_attempts` int DEFAULT 0,
	`lockout_until` timestamp,
	`two_factor_secret` varchar(256),
	`recovery_codes` text,
	CONSTRAINT `auth_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `users` DROP CONSTRAINT `users_email_unique`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','mod','admin') DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `email`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `hash`;