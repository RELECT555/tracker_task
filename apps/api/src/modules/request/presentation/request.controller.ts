import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import type { RequestStatus } from '@tracker/shared';
import { AddCommentHandler } from '../application/commands/add-comment.handler';
import { EscalateRequestHandler } from '../application/commands/escalate-request.handler';
import { ApproveRequestHandler } from '../application/commands/approve-request.handler';
import { CancelRequestHandler } from '../application/commands/cancel-request.handler';
import { ProvideInfoHandler } from '../application/commands/provide-info.handler';
import { RequestInfoHandler } from '../application/commands/request-info.handler';
import { RejectRequestHandler } from '../application/commands/reject-request.handler';
import { SubmitRequestHandler } from '../application/commands/submit-request.handler';
import { CreateRequestHandler } from '../application/commands/create-request.handler';
import { UpdateRequestHandler } from '../application/commands/update-request.handler';
import { GetRequestHandler } from '../application/queries/get-request.handler';
import { ListInboxHandler } from '../application/queries/list-inbox.handler';
import { ListOutboxHandler } from '../application/queries/list-outbox.handler';
import { SearchRequestsHandler } from '../application/queries/search-requests.handler';
import {
  ApproveRequestDto,
  SearchRequestsQueryDto,
  AddCommentDto,
  CancelRequestDto,
  CreateRequestDto,
  EscalateRequestDto,
  ProvideInfoDto,
  RejectRequestDto,
  RequestInfoDto,
  SubmitRequestDto,
  UpdateRequestDto,
} from './dto/request.dto';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';

@Controller('requests')
export class RequestController {
  constructor(
    private readonly createHandler: CreateRequestHandler,
    private readonly updateHandler: UpdateRequestHandler,
    private readonly submitHandler: SubmitRequestHandler,
    private readonly approveHandler: ApproveRequestHandler,
    private readonly rejectHandler: RejectRequestHandler,
    private readonly cancelHandler: CancelRequestHandler,
    private readonly requestInfoHandler: RequestInfoHandler,
    private readonly provideInfoHandler: ProvideInfoHandler,
    private readonly escalateHandler: EscalateRequestHandler,
    private readonly addCommentHandler: AddCommentHandler,
    private readonly getHandler: GetRequestHandler,
    private readonly listOutboxHandler: ListOutboxHandler,
    private readonly listInboxHandler: ListInboxHandler,
    private readonly searchHandler: SearchRequestsHandler,
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

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.updateHandler.execute({
      requestId: id,
      actorId: user.id,
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
      personalSteps: dto.personalSteps,
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

  @Post(':id/escalate')
  escalate(
    @Param('id') id: string,
    @Body() dto: EscalateRequestDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.escalateHandler.execute({
      requestId: id,
      actorId: user.id,
      reason: dto.reason,
    });
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.addCommentHandler.execute({
      requestId: id,
      actorId: user.id,
      body: dto.body,
      isInternal: dto.isInternal,
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
    @Query('sort') sort?: 'sla' | 'recent',
    @Query('scope') scope?: string,
  ) {
    return this.listInboxHandler.execute({
      assigneeId: user.id,
      page,
      limit,
      sort: sort === 'recent' ? 'recent' : 'sla',
      scope: scope === 'archive' ? 'archive' : 'active',
    });
  }

  @Get('search')
  search(
    @CurrentUser() user: { id: string },
    @Query() query: SearchRequestsQueryDto,
  ) {
    return this.searchHandler.execute({ ...query, actorId: user.id });
  }

  // Keep this last: a literal path such as `search` must not be captured as an id.
  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.getHandler.execute(id, user.id);
  }
}
