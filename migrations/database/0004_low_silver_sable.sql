ALTER TABLE `apikey` MODIFY COLUMN `permissions` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `apikey` MODIFY COLUMN `keyhash` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `apikey` MODIFY COLUMN `label` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `appwrite` MODIFY COLUMN `appwrite_endpoint` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `appwrite` MODIFY COLUMN `appwrite_projectid` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `appwrite` MODIFY COLUMN `apppwrite_api_key` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `appwrite` MODIFY COLUMN `version` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `email` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `password_reset_token` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `password_reset_expiry` timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `verification_token` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `verification_expiry` timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `status` int NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `last_login_at` timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `failed_login_attempts` int NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `lockout_until` timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `two_factor_secret` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `recovery_codes` text NOT NULL;--> statement-breakpoint
ALTER TABLE `n8n` MODIFY COLUMN `webhook` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `n8n` MODIFY COLUMN `permissions` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `n8n` MODIFY COLUMN `keyhash` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `n8n` MODIFY COLUMN `label` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` MODIFY COLUMN `name` varchar(256) NOT NULL DEFAULT 'Anon';--> statement-breakpoint
ALTER TABLE `profile` MODIFY COLUMN `bio` varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `profile` MODIFY COLUMN `unsplash` varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `profile` MODIFY COLUMN `github` varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `profile` MODIFY COLUMN `instagram` varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `profile` MODIFY COLUMN `discord` varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `username` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` int NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `reputation` int NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `exp` int NOT NULL;