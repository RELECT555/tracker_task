import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { roadmapTablePreferencesSchema } from '@tracker/shared';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class RoadmapTablePreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roadmapTablePreferences: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    const parsed = roadmapTablePreferencesSchema.safeParse(
      user.roadmapTablePreferences,
    );
    return { preferences: parsed.success ? parsed.data : null };
  }

  async save(userId: string, input: unknown) {
    const parsed = roadmapTablePreferencesSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Некорректные настройки вида таблицы');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { roadmapTablePreferences: parsed.data },
      select: { id: true },
    });
    return { preferences: parsed.data };
  }
}
