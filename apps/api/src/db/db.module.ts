import { Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import { connect } from '@planetscale/database';

import * as schema from './schema';

@Module({
	providers: [
		{
			provide: 'PS_CONNECTION',
			inject: [],
			useFactory: async () => {
				const connection = connect({
					url: process.env.DATABASE_URL,
				});

				return drizzle(connection, { schema, logger: true });
			},
		},
	],
	exports: ['PS_CONNECTION'],
})
export class DBModule {}
