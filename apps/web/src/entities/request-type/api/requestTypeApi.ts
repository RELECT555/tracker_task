import { apiFetch } from '@/shared/api/client';
import type { FieldSchemaItem } from '../model/field-schema';

export interface RequestTypeItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fieldSchema: FieldSchemaItem[];
  defaultRouteTemplateId: string | null;
  allowedManualRoutes: string[];
  allowsPersonalRoute: boolean;
  maxPersonalRouteSteps: number;
}

export type { FieldSchemaItem };

export const requestTypeApi = {
  list: () =>
    apiFetch<{ data: RequestTypeItem[] }>('/request-types'),
};
