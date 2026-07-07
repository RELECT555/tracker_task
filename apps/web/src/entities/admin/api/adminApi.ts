import type { FieldSchemaItem } from '@/entities/request-type/model/field-schema';
import { apiFetch } from '@/shared/api/client';

export interface AdminRequestType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  fieldSchema: FieldSchemaItem[];
  fieldCount: number;
  defaultRouteTemplateId: string | null;
  defaultRouteTemplateName: string | null;
  allowedManualRoutes: string[];
  allowsPersonalRoute: boolean;
  maxPersonalRouteSteps: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRouteTemplateStep {
  order: number;
  name: string;
  assigneeType: string;
  assigneeRef: string;
  slaHours: number | null;
  actions: string[];
}

export interface AdminRouteTemplate {
  id: string;
  name: string;
  version: number;
  isPublished: boolean;
  stepCount: number;
  steps: AdminRouteTemplateStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdminRequestTypeInput {
  code: string;
  name: string;
  description?: string | null;
  fieldSchema?: FieldSchemaItem[];
  defaultRouteTemplateId?: string | null;
  allowedManualRoutes?: string[];
  allowsPersonalRoute?: boolean;
  maxPersonalRouteSteps?: number;
  isActive?: boolean;
}

export interface UpdateAdminRequestTypeInput {
  code?: string;
  name?: string;
  description?: string | null;
  fieldSchema?: FieldSchemaItem[];
  defaultRouteTemplateId?: string | null;
  allowedManualRoutes?: string[];
  allowsPersonalRoute?: boolean;
  maxPersonalRouteSteps?: number;
  isActive?: boolean;
}

export interface CreateAdminRouteTemplateInput {
  name: string;
  steps: AdminRouteTemplateStep[];
  isPublished?: boolean;
}

export interface UpdateAdminRouteTemplateInput {
  name?: string;
  steps?: AdminRouteTemplateStep[];
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  orgUnit: { id: string; name: string } | null;
  manager: { id: string; fullName: string } | null;
  roles: { code: string; name: string }[];
  createdAt: string;
}

export interface AdminRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface AdminOrgUnit {
  id: string;
  name: string;
  path: string;
  head: { id: string; fullName: string } | null;
  children?: AdminOrgUnit[];
}

export interface UpdateAdminUserInput {
  fullName?: string;
  isActive?: boolean;
  orgUnitId?: string;
  managerId?: string | null;
  roleCodes?: string[];
}

export const adminApi = {
  listRequestTypes: () =>
    apiFetch<{ data: AdminRequestType[] }>('/admin/request-types'),

  createRequestType: (input: CreateAdminRequestTypeInput) =>
    apiFetch<{ id: string }>('/admin/request-types', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateRequestType: (id: string, input: UpdateAdminRequestTypeInput) =>
    apiFetch<{ id: string }>(`/admin/request-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  listRouteTemplates: () =>
    apiFetch<{ data: AdminRouteTemplate[] }>('/admin/route-templates'),

  createRouteTemplate: (input: CreateAdminRouteTemplateInput) =>
    apiFetch<{ id: string; version: number }>('/admin/route-templates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateRouteTemplate: (
    id: string,
    version: number,
    input: UpdateAdminRouteTemplateInput,
  ) =>
    apiFetch<{ id: string; version: number }>(
      `/admin/route-templates/${id}/versions/${version}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    ),

  publishRouteTemplate: (id: string) =>
    apiFetch<{ id: string; version: number }>(`/admin/route-templates/${id}/publish`, {
      method: 'PUT',
    }),

  createRouteTemplateVersion: (id: string) =>
    apiFetch<{ id: string; version: number }>(`/admin/route-templates/${id}/versions`, {
      method: 'POST',
    }),

  listUsers: () => apiFetch<{ data: AdminUser[] }>('/admin/users'),

  updateUser: (id: string, input: UpdateAdminUserInput) =>
    apiFetch<{ id: string }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  listRoles: () => apiFetch<{ data: AdminRole[] }>('/admin/roles'),

  listOrgUnits: () =>
    apiFetch<{ data: AdminOrgUnit[]; flat: AdminOrgUnit[] }>('/admin/org-units'),
};
