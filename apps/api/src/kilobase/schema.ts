import { pgTable, uuid, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const authUsers = pgTable('auth_users', {
  id: uuid('id').primaryKey().notNull(),
});

export const profiles = pgTable('profiles', {
  id: uuid('id').notNull().primaryKey().references(() => authUsers.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  username: text('username').notNull().unique(),
  avatarUrl: text('avatar_url'),
  website: text('website'),
});

export const storageBuckets = pgTable('storage_buckets', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
});

export const storageObjects = pgTable('storage_objects', {
  id: uuid('id').primaryKey().notNull(),
  bucketId: text('bucket_id').notNull().references(() => storageBuckets.id),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().notNull(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  key: text('key').notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').default(sql`now()`),
  expiresAt: timestamp('expires_at'),
});
