import { Controller, Get } from '@nestjs/common';
import { ListDirectoryUsersHandler } from '../application/queries/list-directory-users.handler';

@Controller('users')
export class UsersController {
  constructor(private readonly listUsersHandler: ListDirectoryUsersHandler) {}

  @Get()
  list() {
    return this.listUsersHandler.execute();
  }
}
