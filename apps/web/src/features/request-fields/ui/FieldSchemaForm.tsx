'use client';

import dynamic from 'next/dynamic';
import type { FieldSchemaItem } from '@/entities/request-type/model/field-schema';
import type { AuthUser } from '@/entities/user/api/authApi';
import {
  parseDateFieldValue,
  serializeDateFieldValue,
} from '@/entities/request-type/model/field-schema';
import { UserRefField } from '@/features/request-fields/ui/UserRefField';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

const DatePicker = dynamic(
  () => import('@/shared/ui/date-picker').then((m) => m.DatePicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-10 animate-pulse rounded-md border border-input bg-field" />
    ),
  },
);

interface FieldSchemaFormProps {
  schema: FieldSchemaItem[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  idPrefix?: string;
  currentUser?: AuthUser | null;
}

export function FieldSchemaForm({
  schema,
  values,
  onChange,
  idPrefix = 'field',
  currentUser = null,
}: FieldSchemaFormProps) {
  const updateField = (key: string, value: unknown) => {
    onChange({ ...values, [key]: value });
  };

  if (schema.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Для этого типа запроса нет настраиваемых полей.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {schema.map((field) => {
        const fieldId = `${idPrefix}-${field.key}`;
        const rawValue = values[field.key];

        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={fieldId}>
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>

            {field.type === 'date' ? (
              <DatePicker
                id={fieldId}
                value={parseDateFieldValue(rawValue)}
                onChange={(date) =>
                  updateField(field.key, serializeDateFieldValue(date) ?? '')
                }
              />
            ) : field.type === 'number' ? (
              <Input
                id={fieldId}
                type="number"
                value={rawValue === undefined || rawValue === null ? '' : String(rawValue)}
                onChange={(event) => {
                  const next = event.target.value;
                  updateField(
                    field.key,
                    next === '' ? '' : Number(next),
                  );
                }}
              />
            ) : field.type === 'boolean' ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  id={fieldId}
                  type="checkbox"
                  checked={Boolean(rawValue)}
                  onChange={(event) => updateField(field.key, event.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-muted-foreground">Да</span>
              </label>
            ) : field.type === 'select' ? (
              <select
                id={fieldId}
                value={rawValue === undefined || rawValue === null ? '' : String(rawValue)}
                onChange={(event) => updateField(field.key, event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="">—</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                id={fieldId}
                value={rawValue === undefined || rawValue === null ? '' : String(rawValue)}
                onChange={(event) => updateField(field.key, event.target.value)}
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            ) : field.type === 'user_ref' ? (
              <UserRefField
                id={fieldId}
                value={rawValue}
                onChange={(next) => updateField(field.key, next)}
                user={currentUser}
              />
            ) : (
              <Input
                id={fieldId}
                type="text"
                value={rawValue === undefined || rawValue === null ? '' : String(rawValue)}
                onChange={(event) => updateField(field.key, event.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
