import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class IsActiveAdminHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        roles: { some: { role: { code: 'admin' } } },
      },
      select: { id: true },
    });
    return user !== null;
  }
}
