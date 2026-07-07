export interface FieldSchemaItem {
  key: string;
  label: string;
  type: string;
  required: boolean;
}

export function getFieldLabel(
  schema: FieldSchemaItem[],
  key: string,
): string {
  return schema.find((item) => item.key === key)?.label ?? formatFieldKey(key);
}

export function formatFieldKey(key: string): string {
  const labels: Record<string, string> = {
    dateFrom: 'Дата начала',
    dateTo: 'Дата окончания',
    startDate: 'Дата начала',
    endDate: 'Дата окончания',
    days: 'Количество дней',
    reason: 'Причина',
    comment: 'Комментарий',
    amount: 'Сумма',
    description: 'Описание',
  };

  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
}

export function validateFieldSchema(
  schema: FieldSchemaItem[],
  values: Record<string, unknown>,
): string | null {
  for (const field of schema) {
    if (!field.required) {
      continue;
    }

    const value = values[field.key];
    if (value === null || value === undefined || value === '') {
      return `Заполните поле «${field.label}»`;
    }
  }

  return null;
}

export function formatFieldDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Да' : 'Нет';
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function parseDateFieldValue(value: unknown): Date | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

export function serializeDateFieldValue(date: Date | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}
