import {
  Inject,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthUserResolver } from '../../../modules/identity/application/auth-user-resolver';
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifier,
  type VerifiedIdentity,
} from '../../../modules/identity/infrastructure/access-token-verifier';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly verifier: AccessTokenVerifier,
    private readonly users: AuthUserResolver,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.header('authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    if (!token) throw this.unauthorized('Authentication required');
    let identity: VerifiedIdentity;
    try {
      identity = await this.verifier.verify(token);
    } catch {
      throw this.unauthorized('Invalid or expired access token');
    }

    (req as Request & { user: AuthenticatedUser }).user =
      await this.users.resolve(identity);
    next();
  }

  private unauthorized(message: string) {
    return new UnauthorizedException({
      error: { code: 'UNAUTHORIZED', message },
    });
  }
}
