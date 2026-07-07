import { apiFetch } from '@/shared/api/client';

export interface RequestTypeItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fieldSchema: FieldSchemaItem[];
}

export interface FieldSchemaItem {
  key: string;
  label: string;
  type: string;
  required: boolean;
}

export const requestTypeApi = {
  list: () =>
    apiFetch<{ data: RequestTypeItem[] }>('/request-types'),
};
