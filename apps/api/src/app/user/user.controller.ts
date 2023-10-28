import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
} from '@nestjs/common';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
	constructor(private readonly user: UserService) {}

	@Get('/:username')
	async get(@Param('username') username: string) {
		return this.user.getUsername(username);
	}

	@Get('/:username/profile')
	async profile(@Param('username') username: string) {
		return this.user.getProfile(username);
	}
}
