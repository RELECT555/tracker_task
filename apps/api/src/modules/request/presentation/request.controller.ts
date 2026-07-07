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
import { CreateRequestHandler } from '../application/commands/create-request.handler';
import { GetRequestHandler } from '../application/queries/get-request.handler';
import { ListOutboxHandler } from '../application/queries/list-outbox.handler';
import { CreateRequestDto } from './dto/request.dto';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';

@Controller('requests')
export class RequestController {
  constructor(
    private readonly createHandler: CreateRequestHandler,
    private readonly getHandler: GetRequestHandler,
    private readonly listOutboxHandler: ListOutboxHandler,
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
  inbox() {
    return { data: [], meta: { total: 0, page: 1, limit: 20 } };
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.getHandler.execute(id);
  }
}
