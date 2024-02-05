//import { relations } from 'drizzle-orm';
import {
	mysqlTable,
	timestamp,
	varchar,
	serial,
	text,
	int,
	uniqueIndex,
	binary,
} from 'drizzle-orm/mysql-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z, ZodRawShape } from 'zod';

export const users = mysqlTable('users', {
	id: serial('id').primaryKey().notNull(),
	userid: binary('userid', { length: 16}).unique().notNull(),
	username: varchar('username', { length: 255 }).unique().notNull(),
	role: int('role').default(0).notNull(),
	reputation: int('reputation').default(0).notNull(),
	exp: int('exp').default(0).notNull(),
	created_at: timestamp('created_at', { mode: 'string', })
		.notNull()
		.defaultNow(),
}, (table) => {
	return {
	  username_idx: uniqueIndex("username_idx").on(table.username),
	};
  });

export const auth = mysqlTable('auth', {
	id: serial('id').primaryKey().notNull(),
	ulid: binary('ulid', { length: 16}).unique().notNull(),
	userid: binary("userid", { length: 16}).references(() => users.userid).notNull(),
	email: varchar('email', { length: 255 }).unique().notNull(),
	hash: varchar('hash', { length: 255 }).notNull(),
	salt: varchar('salt', { length: 255 }).notNull(),
	password_reset_token: varchar('password_reset_token', { length: 255 }).notNull(),
	password_reset_expiry: timestamp('password_reset_expiry').notNull(),
	verification_token: varchar('verification_token', { length: 255 }).notNull(),
	verification_expiry: timestamp('verification_expiry').notNull(),
	status: int('status').default(0).notNull(),
	last_login_at: timestamp('last_login_at').notNull(),
	failed_login_attempts: int('failed_login_attempts').default(0).notNull(),
	lockout_until: timestamp('lockout_until').notNull(),
	two_factor_secret: varchar('two_factor_secret', { length: 255 }).notNull(),
	recovery_codes: text('recovery_codes').notNull(),
}, (table) => {
	return {
	  email_idx: uniqueIndex("email_idx").on(table.email)
	};
  });

export const profile = mysqlTable('profile', {
	id: serial('id').primaryKey().notNull(),
	ulid: binary('ulid', { length: 16}).unique().notNull(),
	name: varchar('name', { length: 255 }).default('Anon').notNull(),
	bio: varchar('bio', { length: 64 }).default('').notNull(),
	unsplash: varchar('unsplash', { length: 64 }).default('').notNull(),
	github: varchar('github', { length: 64 }).default('').notNull(),
	instagram: varchar('instagram', { length: 64 }).default('').notNull(),
	discord: varchar('discord', { length: 64 }).default('').notNull(),
	userid: binary("userid", { length: 16}).references(() => users.userid).notNull(),
});

export const appwrite = mysqlTable('appwrite', {
	id: serial('id').primaryKey().notNull(),
	ulid: binary('ulid', { length: 16}).unique().notNull(),
	userid: binary("userid", { length: 16}).references(() => users.userid).notNull(),
	appwrite_endpoint: varchar('appwrite_endpoint', { length: 255 }).notNull(),
	appwrite_projectid: varchar('appwrite_projectid', { length: 255 }).notNull(),
	appwrite_api_key: varchar('appwrite_api_key', { length: 255 }).notNull(),
	version: varchar('version', { length: 64 }).notNull(),
	created_at: timestamp('created_at', { mode: 'string' })
		.notNull()
		.defaultNow(),
}, (table) => {
	return {
	  appwrite_api_key_idx: uniqueIndex("appwrite_api_key_idx").on(table.appwrite_api_key)
	};
  });

export const apikey = mysqlTable('apikey', {
	id: serial('id').primaryKey().notNull(),
	ulid: binary('ulid', { length: 16}).unique().notNull(),
	userid: binary("userid", { length: 16}).references(() => users.userid).notNull(),
	permissions: varchar('permissions', { length: 255}).notNull(),
	keyhash: varchar('keyhash', { length: 255 }).notNull(),
	label: varchar('label', { length: 255 }).notNull(),
}, (table) => {
	return {
	  keyhash_idx: uniqueIndex("keyhash_idx").on(table.keyhash)
	};
  });

export const n8n = mysqlTable('n8n', {
	id: serial('id').primaryKey().notNull(),
    ulid: binary('ulid', { length: 16}).unique().notNull(),
	userid: binary("userid", { length: 16}).references(() => users.userid).notNull(),
	webhook: varchar('webhook', { length: 255}).notNull(),
    permissions: varchar('permissions', { length: 255}).notNull(),
	keyhash: varchar('keyhash', { length: 255 }).notNull(),
	label: varchar('label', { length: 255 }).notNull(),

}, (table) => {
	return {
	  keyhash_idx: uniqueIndex("keyhash_idx").on(table.keyhash)
	};
  });

export const globals = mysqlTable('globals', {
	id: serial('id').primaryKey().notNull(),
	key: varchar('key', { length: 255}).notNull(),
	value: varchar('value', { length: 255}).notNull(),
}, (table) => {
	return {
		key_idx: uniqueIndex("key_idx").on(table.key)
	};
});

export const settings = mysqlTable('settings', {
	id: serial('id').primaryKey().notNull(),
	ulid: binary('ulid', { length: 16}).unique().notNull(),
	userid: binary("userid", { length: 16}).references(() => users.userid).notNull(),
	key: varchar('key', { length: 255}).notNull(),
	value: varchar('value', {length: 255}).notNull()
}, (table) => {
	return {
		key_idx: uniqueIndex("key_idx").on(table.key),
	};
});

export const characters = mysqlTable('characters', {
	id: serial('id').primaryKey().notNull(),
	cid: binary('cid', { length: 16}).unique().notNull(),
	userid: binary("userid", { length: 16}).references(() => users.userid).notNull(),
	hp: int('hp').default(0).notNull(),
	mp: int('mp').default(0).notNull(),
	ep: int('ep').default(0).notNull(),
	health: int('health').default(0).notNull(),
	mana: int('mana').default(0).notNull(),
	energy: int('energy').default(0).notNull(),
	armour: int('armour').default(0).notNull(),
	agility: int('agility').default(0).notNull(),
	strength: int('strength').default(0).notNull(),
	intelligence: int('intelligence').default(0).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
	experience: int('experience').default(0).notNull(),
    reputation: int('reputation').default(0).notNull(),
});

/**
 *	TODO: Bank
 * 	!		-> IGBC - [H]clickup#200
 * 	!		-> IGBC - [H]github#135
 * 
 */

/**
 *	TODO: Inventory.
 * 	! - Storage of Inventory -> Object Item.
 * 
 */

// export const inventory = mysqlTable('inventory', {
// 	id: serial('id').primaryKey().notNull(),
// 	uuid: bigint('uuid', { mode: 'number', unsigned: true}).notNull(),
//	bag: 
// })

/**
 *	TODO: Shop
 *	Current issue is the storage of the items!
 * 	
 * 	
 */

/**
 * TODO: Player Saving / Loading via API.
 * TODO: Guild Manager.
 */

// export const usersProfileRelations = relations(users, ({ one }) => ({
// 	profile: one(profile, {
// 		fields: [users.id],
// 		references: [profile.uuid],
// 	}),
// }));

// export const usersAuthRelations = relations(users, ({ one }) => ({
// 	auth: one(auth, {
// 		fields: [users.id],
// 		references: [auth.uuid],
// 	}),
// }));

// export const usersSettingRelations = relations(users, ({ many}) => ({
// 	settings: many(settings),
// }));

// export const usersAPIKeyRelations = relations(users, ({ many }) => ({
// 	apikey: many(apikey),
// }));

// export const usersAppwriteRelations = relations(users, ({ many }) => ({
//     appwrite: many(appwrite),
// }))

// export const usersN8NRelations = relations(users, ({many}) => ({
//     n8n: many(n8n),
// }))

// export const settingsUsersRelations = relations(settings, ({ one }) => ({
// 	user: one(users, {
// 		fields: [settings.uuid],
// 		references: [users.id],
// 	}),
// }));

// export const n8nUsersRelations = relations(n8n, ({ one}) => ({
//     user: one(users, {
//         fields: [n8n.uuid],
//         references: [users.id],
//     }),
// }))

// export const appwriteRelations = relations(appwrite, ({ one }) => ({
// 	user: one(users, {
// 		fields: [appwrite.uuid],
// 		references: [users.id],
// 	}),
// }));

// export const apikeyUsersRelations = relations(apikey, ({ one }) => ({
// 	user: one(users, {
// 		fields: [apikey.uuid],
// 		references: [users.id],
// 	}),
// }));

/**
 * 	Example of the ZOD Schema and Verifcation
 * 
 * 
 * 
 * 
 * TODO      ZOD
*/
export const registerUserSchema = z.object({
	username: z.string(),
	email: z.string(),
	password: z.string(),
	confirmPassword: z.string(),
});

export function registerUserSchemaValidation(schema: ZodRawShape) {
	return registerUserSchema
		.extend(schema)
		.refine((data) => data.password === data.confirmPassword, {
			message: "Passwords do not match",
			path: ["confirmPassword"],
		  })
		.refine((data) => /^[a-zA-Z0-9]+$/.test(data.username) && data.username.length >= 6 && data.username.length <= 32, {
			message: "Username must be 3-32 characters long and only contain alphanumeric characters",
			path: ["username"],
		  });
}

export const insertUserSchema = createInsertSchema(users);

// Schema for selecting a user - can be used to validate API responses

export const selectUserSchema = createSelectSchema(users);
