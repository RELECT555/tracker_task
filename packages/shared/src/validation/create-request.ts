import { z } from 'zod';
import { REQUEST_PRIORITIES } from '../constants/request';

export const createRequestSchema = z.object({
  typeId: z.string().uuid(),
  title: z.string().min(1).max(500),
  fields: z.record(z.unknown()).default({}),
  priority: z.enum(REQUEST_PRIORITIES).default('normal'),
  routeTemplateId: z.string().uuid().nullable().optional(),
});

export type CreateRequestDto = z.infer<typeof createRequestSchema>;
