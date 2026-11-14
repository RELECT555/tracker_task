import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../shared/presentation/decorators/current-user.decorator';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!request.user?.isAdmin) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }

    return true;
  }
}
