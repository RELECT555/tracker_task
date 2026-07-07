import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import type { RequestStatus } from '@tracker/shared';
import { ApproveRequestHandler } from '../application/commands/approve-request.handler';
import { CancelRequestHandler } from '../application/commands/cancel-request.handler';
import { ProvideInfoHandler } from '../application/commands/provide-info.handler';
import { RequestInfoHandler } from '../application/commands/request-info.handler';
import { RejectRequestHandler } from '../application/commands/reject-request.handler';
import { SubmitRequestHandler } from '../application/commands/submit-request.handler';
import { CreateRequestHandler } from '../application/commands/create-request.handler';
import { GetRequestHandler } from '../application/queries/get-request.handler';
import { ListInboxHandler } from '../application/queries/list-inbox.handler';
import { ListOutboxHandler } from '../application/queries/list-outbox.handler';
import {
  ApproveRequestDto,
  CancelRequestDto,
  CreateRequestDto,
  ProvideInfoDto,
  RejectRequestDto,
  RequestInfoDto,
  SubmitRequestDto,
} from './dto/request.dto';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';

@Controller('requests')
export class RequestController {
  constructor(
    private readonly createHandler: CreateRequestHandler,
    private readonly submitHandler: SubmitRequestHandler,
    private readonly approveHandler: ApproveRequestHandler,
    private readonly rejectHandler: RejectRequestHandler,
    private readonly cancelHandler: CancelRequestHandler,
    private readonly requestInfoHandler: RequestInfoHandler,
    private readonly provideInfoHandler: ProvideInfoHandler,
    private readonly getHandler: GetRequestHandler,
    private readonly listOutboxHandler: ListOutboxHandler,
    private readonly listInboxHandler: ListInboxHandler,
  ) {}

  @Post()
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: { id: string }) {
    return this.createHandler.execute({
      typeId: dto.typeId,
      authorId: user.id,
      title: dto.title,
      fields: dto.fields,
      priority: dto.priority,
    });
  }

  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitRequestDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.submitHandler.execute({
      requestId: id,
      actorId: user.id,
      routeTemplateId: dto.routeTemplateId,
    });
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveRequestDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.approveHandler.execute({
      requestId: id,
      actorId: user.id,
      comment: dto.comment,
    });
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectRequestDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.rejectHandler.execute({
      requestId: id,
      actorId: user.id,
      reason: dto.reason,
    });
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelRequestDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.cancelHandler.execute({
      requestId: id,
      actorId: user.id,
      reason: dto.reason,
    });
  }

  @Post(':id/request-info')
  requestInfo(
    @Param('id') id: string,
    @Body() dto: RequestInfoDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.requestInfoHandler.execute({
      requestId: id,
      actorId: user.id,
      message: dto.message,
    });
  }

  @Post(':id/provide-info')
  provideInfo(
    @Param('id') id: string,
    @Body() dto: ProvideInfoDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.provideInfoHandler.execute({
      requestId: id,
      actorId: user.id,
      fields: dto.fields,
      comment: dto.comment,
    });
  }

  @Get('outbox')
  outbox(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.listOutboxHandler.execute({
      authorId: user.id,
      status: status as RequestStatus | undefined,
      page,
      limit,
    });
  }

  @Get('inbox')
  inbox(
    @CurrentUser() user: { id: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.listInboxHandler.execute({
      assigneeId: user.id,
      page,
      limit,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.getHandler.execute(id, user.id);
  }
}
