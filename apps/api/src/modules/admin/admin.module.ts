import { Module } from '@nestjs/common';
import { CreateAdminRequestTypeHandler } from './application/commands/create-admin-request-type.handler';
import { UpdateAdminRequestTypeHandler } from './application/commands/update-admin-request-type.handler';
import { CreateAdminRouteTemplateHandler } from './application/commands/create-admin-route-template.handler';
import { UpdateAdminRouteTemplateHandler } from './application/commands/update-admin-route-template.handler';
import {
  CreateAdminRouteTemplateVersionHandler,
  PublishAdminRouteTemplateHandler,
} from './application/commands/publish-admin-route-template.handler';
import { UpdateAdminUserHandler } from './application/commands/update-admin-user.handler';
import { ListAdminOrgUnitsHandler } from './application/queries/list-admin-org-units.handler';
import { ListAdminRolesHandler } from './application/queries/list-admin-roles.handler';
import { ListAdminUsersHandler } from './application/queries/list-admin-users.handler';
import { ListAdminRequestTypesHandler } from './application/queries/list-admin-request-types.handler';
import { ListAdminRouteTemplatesHandler } from './application/queries/list-admin-route-templates.handler';
import { AdminController } from './presentation/admin.controller';
import { AdminRoleGuard } from './presentation/guards/admin-role.guard';

@Module({
  controllers: [AdminController],
  providers: [
    AdminRoleGuard,
    ListAdminRequestTypesHandler,
    ListAdminRouteTemplatesHandler,
    CreateAdminRequestTypeHandler,
    UpdateAdminRequestTypeHandler,
    CreateAdminRouteTemplateHandler,
    UpdateAdminRouteTemplateHandler,
    PublishAdminRouteTemplateHandler,
    CreateAdminRouteTemplateVersionHandler,
    ListAdminUsersHandler,
    ListAdminRolesHandler,
    UpdateAdminUserHandler,
    ListAdminOrgUnitsHandler,
  ],
})
export class AdminModule {}
