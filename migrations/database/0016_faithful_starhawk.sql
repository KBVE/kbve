ALTER TABLE `auth` MODIFY COLUMN `status` int;--> statement-breakpoint
ALTER TABLE `auth` MODIFY COLUMN `status` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` int;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` int DEFAULT 0;