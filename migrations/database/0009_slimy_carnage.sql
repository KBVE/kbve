ALTER TABLE `auth` MODIFY COLUMN `status` enum('Active','Suspended','Pending');--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());