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
    createdAt: timestamp('createdAt', { mode: 'string' }).defaultNow(),
});

//TODO      ZOD

const insertUserSchema = createInsertSchema(users);

// Schema for selecting a user - can be used to validate API responses

const selectUserSchema = createSelectSchema(users);

