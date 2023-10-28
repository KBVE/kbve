import { Inject, Injectable } from '@nestjs/common';
import { DB, DbType } from '../../db/db.provider';
import { eq, sql } from "drizzle-orm";
import { users } from '../../db/schema';

@Injectable()
export class UserService {
    constructor(@Inject(DB) private readonly db: DbType) {}

	//* Prepared Statements

	kbveUsername = this.db.select().from(users).where(eq(users.username, sql.placeholder('username'))).prepare();


	async get(username: string): Promise<unknown> {
		const result = await this.kbveUsername.execute({username: username});
	
	
		return result.length === 0 ? null : result[0];
	   }
}
