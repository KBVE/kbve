import { relations } from 'drizzle-orm';
import {
    mysqlTable,
    mysqlEnum,
    serial,
    timestamp,
    varchar,
    int,
} from 'drizzle-orm/mysql-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';


export const users = mysqlTable('users', {
    id: serial('id').primaryKey().notNull(),
    username: varchar('username', { length: 256 }).unique(),
    email: varchar('email', { length: 256 }).unique(),
    hash: varchar('hash', { length: 256}).notNull(),
    role: mysqlEnum('role', ["user", "mod", "admin"]),
    reputation: int("reputation").default(0),
    exp: int("exp").default(0),
    createdAt: timestamp('createdAt', { mode: 'string' }).notNull().defaultNow().onUpdateNow(),
});

export const profile = mysqlTable('profile', {
    id: serial('id').primaryKey().notNull(),
    name: varchar('name', { length: 256}).default('Anon'),
    bio: varchar('bio', {length: 64}).default(''),
    unsplash: varchar('unsplash', { length: 64}).default(''),
    github: varchar('github', {length: 64}).default(''),
    instagram: varchar('instagram', {length: 64}).default(''),
    discord: varchar('discord', {length: 64}).default(''),
    uuid: int('uuid')
})

export const usersRelations = relations(users, ({ one }) => ({
    profile: one(profile, {
        fields: [users.id],
        references: [profile.uuid]
    })
  }))


//TODO      ZOD

const insertUserSchema = createInsertSchema(users);

// Schema for selecting a user - can be used to validate API responses

const selectUserSchema = createSelectSchema(users);

