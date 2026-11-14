import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedError } from '../../../../shared/domain/domain.error';
import type { AuthTokens, UserDto } from '../../domain/user.dto';
import { TokenService } from '../../infrastructure/token.service';
import { GetMeHandler } from '../queries/get-me.handler';

const localAdminEmail = 'admin@tracker.local';
const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class LoginHandler {
  constructor(
    private readonly config: ConfigService,
    private readonly getMe: GetMeHandler,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<AuthTokens & { user: UserDto }> {
    const configured = this.config.getOrThrow<string>('LOCAL_ADMIN_PASSWORD');
    if (
      input.email.trim().toLowerCase() !== localAdminEmail ||
      !timingSafeEqual(digest(input.password), digest(configured))
    ) {
      throw new UnauthorizedError('Неверный логин или пароль');
    }

    const user = await this.getMe.byEmail(localAdminEmail);
    if (!user.roles.includes('admin'))
      throw new UnauthorizedError('Вход администратора недоступен');
    return { ...this.tokens.issueTokens(user.id), user };
  }
}
