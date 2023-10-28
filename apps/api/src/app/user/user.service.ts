import { Inject, Injectable } from '@nestjs/common';
import { DB, DbType } from '../../db/db.provider';
import { eq, sql } from 'drizzle-orm';
import { users } from '../../db/schema';

@Injectable()
export class UserService {
	constructor(@Inject(DB) private readonly db: DbType) {}

	//* Prepared Statements

	kbvePublicUsername = this.db
		.select({
			username: users.username,
			reputation: users.reputation,
			exp: users.exp,
			role: users.role,
			created: users.createdAt,
		})
		.from(users)
		.where(eq(users.username, sql.placeholder('username')))
		.prepare();


	//kbvePublicProfile = this.db.select().from(users).where(eq(users.username, sql.placeholder('username')))

	async getUsername(username: string): Promise<unknown> {
		const result = await this.kbvePublicUsername.execute({
			username: username,
		});
		return result.length === 0 ? null : result[0];
	}
}
