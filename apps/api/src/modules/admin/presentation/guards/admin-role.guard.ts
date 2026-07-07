import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ devUser?: { id: string } }>();
    const userId = request.devUser?.id;

    if (!userId) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });

    const isAdmin =
      user?.isActive &&
      user.roles.some((entry) => entry.role.code === 'admin');

    if (!isAdmin) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }

    return true;
  }
}
