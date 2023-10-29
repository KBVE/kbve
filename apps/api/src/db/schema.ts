import { relations } from 'drizzle-orm';
import {
    mysqlTable,
    mysqlEnum,
    serial,
    timestamp,
    varchar,
    text,
    int,
} from 'drizzle-orm/mysql-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';


export const users = mysqlTable('users', {
    id: serial('id').primaryKey().notNull(),
    username: varchar('username', { length: 256 }).unique(),
    role: mysqlEnum('role', ["user", "mod", "admin"]),
    reputation: int("reputation").default(0),
    exp: int("exp").default(0),
    createdAt: timestamp('createdAt', { mode: 'string' }).notNull().defaultNow(),
});

export const auth = mysqlTable('auth', {
    id: serial('id').primaryKey().notNull(),
    uuid: int('uuid'),
    email: varchar('email', { length: 256 }).unique(),
    hash: varchar('hash', { length: 256}).notNull(),
    salt: varchar('salt', { length: 256}).notNull(),
    password_reset_token: varchar('password_reset_token', { length: 256 }),
    password_reset_expiry: timestamp('password_reset_expiry'),
    verification_token: varchar('verification_token', { length: 256 }),
    verification_expiry: timestamp('verification_expiry'),
    status: mysqlEnum('status', ['Active', 'Suspended', 'Pending']),
    last_login_at: timestamp('last_login_at'),
    failed_login_attempts: int('failed_login_attempts').default(0),
    lockout_until: timestamp('lockout_until'),
    two_factor_secret: varchar('two_factor_secret', { length: 256 }),
    recovery_codes: text('recovery_codes'),

})

export const profile = mysqlTable('profile', {
    id: serial('id').primaryKey().notNull(),
    name: varchar('name', { length: 256}).default('Anon'),
    bio: varchar('bio', {length: 64}).default(''),
    unsplash: varchar('unsplash', { length: 64}).default(''),
    github: varchar('github', {length: 64}).default(''),
    instagram: varchar('instagram', {length: 64}).default(''),
    discord: varchar('discord', {length: 64}).default(''),
    uuid: int('uuid')
});

// 10/28/2023 - 9:30pm - API Key
export const apikey = mysqlTable('apikey', {
    id: serial('id').primaryKey().notNull(),
    uuid: int('uuid'),
    


})

export const usersProfileRelations = relations(users, ({ one }) => ({
    profile: one(profile, {
        fields: [users.id],
        references: [profile.uuid]
    })
  }));


  export const usersAuthRelations = relations(users, ({ one }) => ({
    auth: one(auth, {
        fields: [users.id],
        references: [auth.uuid]
    })
  }));




//TODO      ZOD

const insertUserSchema = createInsertSchema(users);

// Schema for selecting a user - can be used to validate API responses

const selectUserSchema = createSelectSchema(users);

