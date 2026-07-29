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
    throw new ValidationError('Список полей формы должен быть массивом');
  }

  const keys = new Set<string>();

  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new ValidationError(`Поле №${index + 1}: некорректный формат`);
    }

    const field = item as Record<string, unknown>;
    const key = String(field.key ?? '').trim();
    const label = String(field.label ?? '').trim();
    const type = String(field.type ?? '').trim();
    const required = Boolean(field.required);

    if (!FIELD_KEY_PATTERN.test(key)) {
      throw new ValidationError(
        `Поле №${index + 1}: ключ должен начинаться с латинской буквы и содержать только a–z, 0–9 и _ (например: due_date)`,
      );
    }

    if (keys.has(key)) {
      throw new ValidationError(`Повторяющийся ключ поля: «${key}»`);
    }
    keys.add(key);

    if (!label) {
      throw new ValidationError(`Поле «${key}»: укажите подпись`);
    }

    if (!ALLOWED_TYPES.has(type)) {
      throw new ValidationError(`Поле «${key}»: неподдерживаемый тип «${type}»`);
    }

    let options: { value: string; label: string }[] | undefined;
    if (type === 'select') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new ValidationError(`Поле «${key}»: добавьте хотя бы один вариант списка`);
      }

      options = field.options.map((option, optionIndex) => {
        if (!option || typeof option !== 'object') {
          throw new ValidationError(
            `Поле «${key}»: вариант №${optionIndex + 1} имеет некорректный формат`,
          );
        }

        const entry = option as Record<string, unknown>;
        const value = String(entry.value ?? '').trim();
        const optionLabel = String(entry.label ?? '').trim();

        if (!value || !optionLabel) {
          throw new ValidationError(
            `Поле «${key}»: у варианта №${optionIndex + 1} нужны значение и подпись`,
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
    throw new ValidationError(
      'Код типа: только латиница в нижнем регистре, цифры и подчёркивание; начинается с буквы (например: contract_approval)',
    );
  }
  return normalized;
}
