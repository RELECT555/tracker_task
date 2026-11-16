import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { IsActiveAdminHandler } from '../identity/application/queries/is-active-admin.handler';
import { RoadmapIntegrationService } from './roadmap-integration.service';
import { WriteBackSettings } from './roadmap-write-back.settings';

/** Who may send the plan to Azure DevOps, and whether write-back is on for a project. */
@Injectable()
export class RoadmapWriteBackAccessService {
  constructor(
    private readonly integration: RoadmapIntegrationService,
    private readonly isActiveAdmin: IsActiveAdminHandler,
  ) {}

  assertProjectAllowed(settings: WriteBackSettings, projectId: string) {
    if (settings.projectIds && !settings.projectIds.includes(projectId)) {
      throw new BadRequestException(
        'Этот проект не включён в запись плана. Добавьте его в настройках интеграции.',
      );
    }
  }

  async canManuallyPush(
    actorId: string,
    settings: WriteBackSettings,
  ): Promise<boolean> {
    return (
      Boolean(actorId) &&
      (settings.pushPermission !== 'admins' ||
        (await this.isActiveAdmin.execute(actorId)))
    );
  }

  async assertCanManuallyPush(actorId: string, settings: WriteBackSettings) {
    if (!(await this.canManuallyPush(actorId, settings))) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message:
            'Отправка плана в Azure DevOps доступна только администраторам.',
        },
      });
    }
  }

  async assertWriteBackEnabled(actorId: string) {
    const settings = await this.integration.getWriteBackSettings();
    await this.assertCanManuallyPush(actorId, settings);
    if (settings.mode === 'off') {
      throw new BadRequestException(
        'Запись плана в Azure DevOps выключена. Включите её в администрировании Roadmap → Интеграции.',
      );
    }
    return settings;
  }
}
