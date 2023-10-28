ALTER TABLE `profile` DROP FOREIGN KEY `profile_uuid_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `profile` MODIFY COLUMN `uuid` int;