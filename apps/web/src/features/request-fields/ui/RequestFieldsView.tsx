import type { FieldSchemaItem } from '@/entities/request-type/model/field-schema';
import {
  formatFieldDisplayValue,
  formatFieldKey,
  getFieldLabel,
} from '@/entities/request-type/model/field-schema';

export function RequestFieldsView({
  fields,
  schema = [],
}: {
  fields: Record<string, unknown>;
  schema?: FieldSchemaItem[];
}) {
  const orderedKeys =
    schema.length > 0
      ? [
          ...schema.map((item) => item.key),
          ...Object.keys(fields).filter(
            (key) => !schema.some((item) => item.key === key),
          ),
        ]
      : Object.keys(fields);

  if (orderedKeys.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border/60 px-3 py-2.5 text-sm text-muted-foreground">
        Дополнительные поля не заполнены
      </p>
    );
  }

  return (
    <dl className="divide-y divide-border/60">
      {orderedKeys.map((key) => (
        <div
          key={key}
          className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(140px,35%)_1fr] sm:gap-4"
        >
          <dt className="text-sm text-muted-foreground">
            {schema.length > 0 ? getFieldLabel(schema, key) : formatFieldKey(key)}
          </dt>
          <dd className="text-sm font-medium whitespace-pre-wrap">
            {formatFieldDisplayValue(fields[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}
