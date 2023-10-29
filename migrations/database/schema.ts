import { mysqlTable, mysqlSchema, AnyMySqlColumn, primaryKey, unique, serial, int, varchar, timestamp, mysqlEnum, text } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"


export const auth = mysqlTable("auth", {
	id: serial("id").notNull(),
	uuid: int("uuid"),
	email: varchar("email", { length: 256 }),
	hash: varchar("hash", { length: 256 }).notNull(),
	salt: varchar("salt", { length: 256 }).notNull(),
	passwordResetToken: varchar("password_reset_token", { length: 256 }),
	passwordResetExpiry: timestamp("password_reset_expiry", { mode: 'string' }),
	verificationToken: varchar("verification_token", { length: 256 }),
	verificationExpiry: timestamp("verification_expiry", { mode: 'string' }),
	status: mysqlEnum("status", ['Active','Suspended','Pending']).default('Pending'),
	lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
	failedLoginAttempts: int("failed_login_attempts").default(0),
	lockoutUntil: timestamp("lockout_until", { mode: 'string' }),
	twoFactorSecret: varchar("two_factor_secret", { length: 256 }),
	recoveryCodes: text("recovery_codes"),
},
(table) => {
	return {
		authId: primaryKey(table.id),
		authEmailUnique: unique("auth_email_unique").on(table.email),
	}
});

export const profile = mysqlTable("profile", {
	id: serial("id").notNull(),
	name: varchar("name", { length: 256 }).default('Anon'),
	bio: varchar("bio", { length: 64 }).default(''),
	unsplash: varchar("unsplash", { length: 64 }).default(''),
	github: varchar("github", { length: 64 }).default(''),
	instagram: varchar("instagram", { length: 64 }).default(''),
	discord: varchar("discord", { length: 64 }).default(''),
	uuid: int("uuid"),
},
(table) => {
	return {
		profileId: primaryKey(table.id),
	}
});

export const users = mysqlTable("users", {
	id: serial("id").notNull(),
	username: varchar("username", { length: 256 }),
	email: varchar("email", { length: 256 }),
	reputation: int("reputation").default(0),
	exp: int("exp").default(0),
	createdAt: timestamp("createdAt", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	role: mysqlEnum("role", ['user','mod','admin']),
	hash: varchar("hash", { length: 256 }).notNull(),
},
(table) => {
	return {
		usersId: primaryKey(table.id),
		usersUsernameUnique: unique("users_username_unique").on(table.username),
		usersEmailUnique: unique("users_email_unique").on(table.email),
	}
});