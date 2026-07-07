import { ValidationError } from '../../../shared/domain/domain.error';

export interface FieldSchemaInput {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: { value: string; label: string }[];
}

const ALLOWED_TYPES = new Set([
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'select',
  'user_ref',
]);

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export function normalizeFieldSchema(raw: unknown): FieldSchemaInput[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError('fieldSchema must be an array');
  }

  const keys = new Set<string>();

  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new ValidationError(`fieldSchema[${index}] must be an object`);
    }

    const field = item as Record<string, unknown>;
    const key = String(field.key ?? '').trim();
    const label = String(field.label ?? '').trim();
    const type = String(field.type ?? '').trim();
    const required = Boolean(field.required);

    if (!FIELD_KEY_PATTERN.test(key)) {
      throw new ValidationError(
        `fieldSchema[${index}].key must match ${FIELD_KEY_PATTERN.source}`,
      );
    }

    if (keys.has(key)) {
      throw new ValidationError(`Duplicate field key: ${key}`);
    }
    keys.add(key);

    if (!label) {
      throw new ValidationError(`fieldSchema[${index}].label is required`);
    }

    if (!ALLOWED_TYPES.has(type)) {
      throw new ValidationError(`Unsupported field type: ${type}`);
    }

    let options: { value: string; label: string }[] | undefined;
    if (type === 'select') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new ValidationError(`Field "${key}" requires options`);
      }

      options = field.options.map((option, optionIndex) => {
        if (!option || typeof option !== 'object') {
          throw new ValidationError(
            `fieldSchema[${index}].options[${optionIndex}] must be an object`,
          );
        }

        const entry = option as Record<string, unknown>;
        const value = String(entry.value ?? '').trim();
        const optionLabel = String(entry.label ?? '').trim();

        if (!value || !optionLabel) {
          throw new ValidationError(
            `fieldSchema[${index}].options[${optionIndex}] requires value and label`,
          );
        }

        return { value, label: optionLabel };
      });
    }

    return { key, label, type, required, options };
  });
}

export function normalizeRequestTypeCode(code: string): string {
  const normalized = code.trim().toLowerCase();
  if (!FIELD_KEY_PATTERN.test(normalized)) {
    throw new ValidationError('code must contain lowercase letters, numbers, and underscores');
  }
  return normalized;
}
