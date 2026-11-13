import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { IsActiveAdminHandler } from '../../../identity/application/queries/is-active-admin.handler';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly isActiveAdmin: IsActiveAdminHandler) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ devUser?: { id: string } }>();
    const userId = request.devUser?.id;

    if (!userId || !(await this.isActiveAdmin.execute(userId))) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }

    return true;
  }
}
