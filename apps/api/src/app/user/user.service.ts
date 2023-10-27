import { Inject, Injectable } from '@nestjs/common';
import { DB, DbType } from '../../db/db.provider';
import { eq } from "drizzle-orm";
import { users } from '../../db/schema';

@Injectable()
export class UserService {
    constructor(@Inject(DB) private readonly db: DbType) {}

	async get(id: number): Promise<unknown> {
		const result = await this.db.select().from(users).where(eq(users.id, id));
	
	
		return result.length === 0 ? null : result[0];
	   }
}
