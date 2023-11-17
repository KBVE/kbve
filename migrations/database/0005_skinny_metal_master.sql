ALTER TABLE `apikey` ADD CONSTRAINT `uuid_idx` UNIQUE(`uuid`);--> statement-breakpoint
ALTER TABLE `apikey` ADD CONSTRAINT `keyhash_idx` UNIQUE(`keyhash`);--> statement-breakpoint
ALTER TABLE `appwrite` ADD CONSTRAINT `uuid_idx` UNIQUE(`uuid`);--> statement-breakpoint
ALTER TABLE `appwrite` ADD CONSTRAINT `appwrite_api_key_idx` UNIQUE(`apppwrite_api_key`);--> statement-breakpoint
ALTER TABLE `auth` ADD CONSTRAINT `uuid_idx` UNIQUE(`uuid`);--> statement-breakpoint
ALTER TABLE `auth` ADD CONSTRAINT `email_idx` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `n8n` ADD CONSTRAINT `uuid_idx` UNIQUE(`uuid`);--> statement-breakpoint
ALTER TABLE `profile` ADD CONSTRAINT `uuid_idx` UNIQUE(`uuid`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `username_idx` UNIQUE(`username`);