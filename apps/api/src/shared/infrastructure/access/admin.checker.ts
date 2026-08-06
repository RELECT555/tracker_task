import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminChecker {
  constructor(private readonly prisma: PrismaService) {}

  async isAdmin(userId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { userId, role: { code: 'admin' }, user: { isActive: true } },
    });
    return count > 0;
  }
}
