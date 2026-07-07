import { Controller, Get } from '@nestjs/common';
import { ListRequestTypesHandler } from '../application/queries/list-request-types.handler';

@Controller('request-types')
export class RequestTypeController {
  constructor(private readonly listHandler: ListRequestTypesHandler) {}

  @Get()
  list() {
    return this.listHandler.execute();
  }
}
