import type { Config } from 'drizzle-kit';
import * as dotenv from "dotenv";
dotenv.config();

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required.');
}

export default {
    schema: './apps/api/src/db/schema.ts',
    out: './migrations/database',
    driver: 'mysql2',
    dbCredentials: {
        uri: ((process.env.DATABASE_URL) as string),
    },
} satisfies Config;