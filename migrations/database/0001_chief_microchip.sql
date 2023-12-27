ALTER TABLE `apikey` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `appwrite` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `auth` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `n8n` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `profile` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `settings` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `n8n` ADD CONSTRAINT `keyhash_idx` UNIQUE(`keyhash`);--> statement-breakpoint
ALTER TABLE `apikey` DROP INDEX `uuid_idx`;--> statement-breakpoint
ALTER TABLE `appwrite` DROP INDEX `uuid_idx`;--> statement-breakpoint
ALTER TABLE `auth` DROP INDEX `uuid_idx`;--> statement-breakpoint
ALTER TABLE `n8n` DROP INDEX `uuid_idx`;--> statement-breakpoint
ALTER TABLE `profile` DROP INDEX `uuid_idx`;--> statement-breakpoint
ALTER TABLE `settings` DROP INDEX `uuid_idx`;--> statement-breakpoint
ALTER TABLE `apikey` ADD `ulid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `apikey` ADD `userid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `appwrite` ADD `ulid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `appwrite` ADD `userid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` ADD `ulid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `auth` ADD `userid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `n8n` ADD `ulid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `n8n` ADD `userid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` ADD `ulid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` ADD `userid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `ulid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `userid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `ulid` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `apikey` ADD CONSTRAINT `apikey_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appwrite` ADD CONSTRAINT `appwrite_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth` ADD CONSTRAINT `auth_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `n8n` ADD CONSTRAINT `n8n_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `profile` ADD CONSTRAINT `profile_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settings` ADD CONSTRAINT `settings_userid_users_ulid_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`ulid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `apikey` DROP COLUMN `id`;--> statement-breakpoint
ALTER TABLE `apikey` DROP COLUMN `uuid`;--> statement-breakpoint
ALTER TABLE `appwrite` DROP COLUMN `id`;--> statement-breakpoint
ALTER TABLE `appwrite` DROP COLUMN `uuid`;--> statement-breakpoint
ALTER TABLE `auth` DROP COLUMN `id`;--> statement-breakpoint
ALTER TABLE `auth` DROP COLUMN `uuid`;--> statement-breakpoint
ALTER TABLE `n8n` DROP COLUMN `id`;--> statement-breakpoint
ALTER TABLE `n8n` DROP COLUMN `uuid`;--> statement-breakpoint
ALTER TABLE `profile` DROP COLUMN `id`;--> statement-breakpoint
ALTER TABLE `profile` DROP COLUMN `uuid`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `id`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `uuid`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `id`;--> statement-breakpoint
ALTER TABLE `apikey` ADD PRIMARY KEY(`ulid`);--> statement-breakpoint
ALTER TABLE `appwrite` ADD PRIMARY KEY(`ulid`);--> statement-breakpoint
ALTER TABLE `auth` ADD PRIMARY KEY(`ulid`);--> statement-breakpoint
ALTER TABLE `n8n` ADD PRIMARY KEY(`ulid`);--> statement-breakpoint
ALTER TABLE `profile` ADD PRIMARY KEY(`ulid`);--> statement-breakpoint
ALTER TABLE `settings` ADD PRIMARY KEY(`ulid`);--> statement-breakpoint
ALTER TABLE `users` ADD PRIMARY KEY(`ulid`);