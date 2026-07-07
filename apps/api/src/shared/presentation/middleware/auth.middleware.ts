import {
  Injectable,
  NestMiddleware,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { TokenService } from '../../../modules/identity/infrastructure/token.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException({
        error: {
          code: 'DB_UNAVAILABLE',
          message: 'Database is not available. Run: docker compose up -d',
        },
      });
    }

    const authHeader = req.header('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      try {
        const userId = this.tokens.verifyAccessToken(token);
        (req as Request & { devUser: { id: string } }).devUser = { id: userId };
        return next();
      } catch {
        throw new UnauthorizedException({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired access token',
          },
        });
      }
    }

    const devUserId = this.config.get<string>('DEV_USER_ID');
    const headerUserId = req.header('x-user-id');
    let userId = headerUserId ?? devUserId;

    if (!userId) {
      const admin = await this.prisma.user.findFirst({
        where: { email: 'admin@tracker.local' },
      });
      userId = admin?.id;
    }

    if (!userId) {
      throw new ServiceUnavailableException({
        error: {
          code: 'DEV_USER_NOT_FOUND',
          message: 'Run db:seed to create dev user',
        },
      });
    }

    (req as Request & { devUser: { id: string } }).devUser = { id: userId };
    next();
  }
}
