import { Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../../../../shared/domain/domain.error';
import type { AuthTokens } from '../../domain/user.dto';
import { TokenService } from '../../infrastructure/token.service';

@Injectable()
export class RefreshTokenHandler {
  constructor(private readonly tokens: TokenService) {}

  execute(refreshToken: string): AuthTokens {
    try {
      const userId = this.tokens.verifyRefreshToken(refreshToken);
      return this.tokens.issueTokens(userId);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }
}
