import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CreateAdminRequestTypeHandler } from '../application/commands/create-admin-request-type.handler';
import { UpdateAdminRequestTypeHandler } from '../application/commands/update-admin-request-type.handler';
import { CreateAdminRouteTemplateHandler } from '../application/commands/create-admin-route-template.handler';
import { UpdateAdminRouteTemplateHandler } from '../application/commands/update-admin-route-template.handler';
import {
  CreateAdminRouteTemplateVersionHandler,
  PublishAdminRouteTemplateHandler,
} from '../application/commands/publish-admin-route-template.handler';
import { UpdateAdminUserHandler } from '../application/commands/update-admin-user.handler';
import { ListAdminOrgUnitsHandler } from '../application/queries/list-admin-org-units.handler';
import { ListAdminRolesHandler } from '../application/queries/list-admin-roles.handler';
import { ListAdminUsersHandler } from '../application/queries/list-admin-users.handler';
import { ListAdminRequestTypesHandler } from '../application/queries/list-admin-request-types.handler';
import { ListAdminRouteTemplatesHandler } from '../application/queries/list-admin-route-templates.handler';
import {
  CreateAdminRequestTypeDto,
  UpdateAdminRequestTypeDto,
} from './dto/admin-request-type.dto';
import {
  CreateAdminRouteTemplateDto,
  UpdateAdminRouteTemplateDto,
} from './dto/admin-route-template.dto';
import { UpdateAdminUserDto } from './dto/admin-user.dto';
import { AdminRoleGuard } from './guards/admin-role.guard';

@Controller('admin')
@UseGuards(AdminRoleGuard)
export class AdminController {
  constructor(
    private readonly listRequestTypesHandler: ListAdminRequestTypesHandler,
    private readonly listRouteTemplatesHandler: ListAdminRouteTemplatesHandler,
    private readonly createRequestTypeHandler: CreateAdminRequestTypeHandler,
    private readonly updateRequestTypeHandler: UpdateAdminRequestTypeHandler,
    private readonly createRouteTemplateHandler: CreateAdminRouteTemplateHandler,
    private readonly updateRouteTemplateHandler: UpdateAdminRouteTemplateHandler,
    private readonly publishRouteTemplateHandler: PublishAdminRouteTemplateHandler,
    private readonly createRouteTemplateVersionHandler: CreateAdminRouteTemplateVersionHandler,
    private readonly listUsersHandler: ListAdminUsersHandler,
    private readonly listRolesHandler: ListAdminRolesHandler,
    private readonly updateUserHandler: UpdateAdminUserHandler,
    private readonly listOrgUnitsHandler: ListAdminOrgUnitsHandler,
  ) {}

  @Get('request-types')
  listRequestTypes() {
    return this.listRequestTypesHandler.execute();
  }

  @Post('request-types')
  createRequestType(@Body() dto: CreateAdminRequestTypeDto) {
    return this.createRequestTypeHandler.execute(dto);
  }

  @Patch('request-types/:id')
  updateRequestType(
    @Param('id') id: string,
    @Body() dto: UpdateAdminRequestTypeDto,
  ) {
    return this.updateRequestTypeHandler.execute({ id, ...dto });
  }

  @Get('route-templates')
  listRouteTemplates() {
    return this.listRouteTemplatesHandler.execute();
  }

  @Post('route-templates')
  createRouteTemplate(@Body() dto: CreateAdminRouteTemplateDto) {
    return this.createRouteTemplateHandler.execute(dto);
  }

  @Patch('route-templates/:id/versions/:version')
  updateRouteTemplate(
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: UpdateAdminRouteTemplateDto,
  ) {
    return this.updateRouteTemplateHandler.execute({ id, version, ...dto });
  }

  @Put('route-templates/:id/publish')
  publishRouteTemplate(@Param('id') id: string) {
    return this.publishRouteTemplateHandler.execute(id);
  }

  @Post('route-templates/:id/versions')
  createRouteTemplateVersion(@Param('id') id: string) {
    return this.createRouteTemplateVersionHandler.execute(id);
  }

  @Get('users')
  listUsers() {
    return this.listUsersHandler.execute();
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.updateUserHandler.execute({ id, ...dto });
  }

  @Get('roles')
  listRoles() {
    return this.listRolesHandler.execute();
  }

  @Get('org-units')
  listOrgUnits() {
    return this.listOrgUnitsHandler.execute();
  }
}
