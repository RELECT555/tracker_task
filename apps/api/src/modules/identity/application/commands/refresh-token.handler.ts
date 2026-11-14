import { Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../../../../shared/domain/domain.error';
import type { AuthTokens } from '../../domain/user.dto';
import { TokenService } from '../../infrastructure/token.service';
import { GetMeHandler } from '../queries/get-me.handler';

@Injectable()
export class RefreshTokenHandler {
  constructor(
    private readonly tokens: TokenService,
    private readonly getMe: GetMeHandler,
  ) {}

  async execute(refreshToken: string): Promise<AuthTokens> {
    let userId: string;
    try {
      userId = this.tokens.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
    await this.getMe.execute(userId);
    return this.tokens.issueTokens(userId);
  }
}
