import { apiFetch } from '@/shared/api/client';
import type { FieldSchemaItem } from '../model/field-schema';

export interface RequestTypeItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fieldSchema: FieldSchemaItem[];
}

export type { FieldSchemaItem };

export const requestTypeApi = {
  list: () =>
    apiFetch<{ data: RequestTypeItem[] }>('/request-types'),
};
