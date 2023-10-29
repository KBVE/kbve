ALTER TABLE `users` MODIFY COLUMN `role` enum('user','mod','admin');--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);