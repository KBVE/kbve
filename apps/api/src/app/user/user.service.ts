import { Inject, Injectable } from '@nestjs/common';
import { DB, DbType } from '../../db/db.provider';
import { eq, sql } from 'drizzle-orm';
import { users } from '../../db/schema';

@Injectable()
export class UserService {
	constructor(@Inject(DB) private readonly db: DbType) {}

	//* 	Prepared Statements [START]

	kbvePublicUsername = this.db
		.select({
			username: users.username,
			reputation: users.reputation,
			exp: users.exp,
			role: users.role,
		})
		.from(users)
		.where(eq(users.username, sql.placeholder('username')))
		.prepare();

	//* 	Prepared Statements [END]


	async getUsername(username: string): Promise<unknown> {
		const result = await this.kbvePublicUsername.execute({
			username: username,
		});
		return result.length === 0 ? null : result[0];
	}

	async getProfile(username: string): Promise<unknown> {
		const result = await this.db.query.users.findFirst({
			where: eq(users.username, username),
			columns: {
				id: false,
			},

			with: {
				profile: {
					columns: {
						id: false,
						uuid: false,
					},
				},
			},
		});
		return result;
	}
}
