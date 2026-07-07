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
    <div className="rounded-lg border border-border bg-muted px-4 dark:bg-field/30">
      <dl className="divide-y divide-border">
        {orderedKeys.map((key) => (
          <div
            key={key}
            className="grid gap-1 py-3.5 first:pt-3 last:pb-3 sm:grid-cols-[minmax(140px,35%)_1fr] sm:items-baseline sm:gap-6"
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {schema.length > 0 ? getFieldLabel(schema, key) : formatFieldKey(key)}
            </dt>
            <dd className="text-sm font-medium whitespace-pre-wrap text-foreground">
              {formatFieldDisplayValue(fields[key])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
