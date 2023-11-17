ALTER TABLE `apikey` MODIFY COLUMN `uuid` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `appwrite` MODIFY COLUMN `uuid` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `uuid` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `n8n` MODIFY COLUMN `uuid` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` MODIFY COLUMN `uuid` bigint unsigned NOT NULL;