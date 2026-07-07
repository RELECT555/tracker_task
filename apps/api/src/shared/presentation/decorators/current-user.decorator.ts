import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface DevUserPayload {
  id: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DevUserPayload => {
    const request = ctx.switchToHttp().getRequest<{ devUser: DevUserPayload }>();
    return request.devUser;
  },
);
