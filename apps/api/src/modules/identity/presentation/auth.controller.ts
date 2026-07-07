import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { LoginHandler } from '../application/commands/login.handler';
import { RefreshTokenHandler } from '../application/commands/refresh-token.handler';
import { GetMeHandler } from '../application/queries/get-me.handler';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginHandler: LoginHandler,
    private readonly refreshHandler: RefreshTokenHandler,
    private readonly getMeHandler: GetMeHandler,
  ) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.loginHandler.execute(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.refreshHandler.execute(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: { id: string }) {
    return this.getMeHandler.execute(user.id).then((profile) => ({ user: profile }));
  }
}
