import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  issueTokens(userId: string): {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  } {
    const accessExpires =
      (this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m') as JwtSignOptions['expiresIn'];
    const refreshExpires =
      (this.config.get<string>('JWT_REFRESH_EXPIRES') ?? '7d') as JwtSignOptions['expiresIn'];

    const accessToken = this.jwt.sign(
      { sub: userId, type: 'access' } satisfies TokenPayload,
      { expiresIn: accessExpires },
    );

    const refreshToken = this.jwt.sign(
      { sub: userId, type: 'refresh' } satisfies TokenPayload,
      { expiresIn: refreshExpires },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiresInSeconds(String(accessExpires ?? '15m')),
    };
  }

  verifyAccessToken(token: string): string {
    const payload = this.jwt.verify<TokenPayload>(token);
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return payload.sub;
  }

  verifyRefreshToken(token: string): string {
    const payload = this.jwt.verify<TokenPayload>(token);
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return payload.sub;
  }

  private parseExpiresInSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) {
      return 900;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 3600;
      case 'd':
        return amount * 86400;
      default:
        return 900;
    }
  }
}
