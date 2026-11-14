import {
  Injectable,
  NestMiddleware,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TokenService } from '../../../modules/identity/infrastructure/token.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
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
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    if (!token) throw this.unauthorized('Authentication required');
    let id: string;
    try {
      id = this.tokens.verifyAccessToken(token);
    } catch {
      throw this.unauthorized('Invalid or expired access token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        isActive: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user?.isActive) throw this.unauthorized('Account is inactive');

    (req as Request & { user: AuthenticatedUser }).user = {
      id: user.id,
      email: user.email,
      isAdmin: user.roles.some(({ role }) => role.code === 'admin'),
    };
    next();
  }

  private unauthorized(message: string) {
    return new UnauthorizedException({
      error: { code: 'UNAUTHORIZED', message },
    });
  }
}
