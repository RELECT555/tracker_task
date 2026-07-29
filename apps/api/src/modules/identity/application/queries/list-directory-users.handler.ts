import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class ListDirectoryUsersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    });

    return {
      data: users.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      })),
    };
  }
}
