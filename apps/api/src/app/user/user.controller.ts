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

  @Get('/:id')
  async get(@Param('id') id: string) {
    return this.user.get(+id);
  }
}