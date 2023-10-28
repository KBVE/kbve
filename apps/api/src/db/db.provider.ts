import { FactoryProvider, Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import {  MySql2Database } from 'drizzle-orm/mysql2';
import { DefaultLogger, LogWriter } from 'drizzle-orm';

import { connect } from '@planetscale/database';
import * as schema from './schema';

export const DB = Symbol('DB_SERVICE');

export type DbType = MySql2Database<typeof schema>;
//export type DbType = MySql2DrizzleConfig;

export const DbProvider: FactoryProvider = {
    provide: DB,
    inject: [],
			useFactory: async () => {

				const logger = new Logger('DB');

				logger.debug('[!] Connecting to PS...');

				const connection = connect({
					url: process.env.DATABASE_URL,
				});

				logger.debug(':D Connected to PS!');

				class CustomDbLogWriter implements LogWriter {
					write(message: string) {
					  logger.verbose(message);
					}
				  }

				return drizzle(connection, { schema, logger: new DefaultLogger({ writer: new CustomDbLogWriter() }) });
			},

}
