'use client';

import { Fragment } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  FIELD_SCHEMA_TYPES,
  type FieldSchemaItem,
} from '@/entities/request-type/model/field-schema';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

function emptyField(): FieldSchemaItem {
  return {
    key: '',
    label: '',
    type: 'text',
    required: false,
  };
}

function optionsToText(options: FieldSchemaItem['options']): string {
  return (options ?? []).map((option) => `${option.value}|${option.label}`).join('\n');
}

function textToOptions(text: string): { value: string; label: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...rest] = line.split('|');
      const label = rest.join('|').trim();
      return { value: value.trim(), label: label || value.trim() };
    });
}

interface FieldSchemaEditorProps {
  value: FieldSchemaItem[];
  onChange: (value: FieldSchemaItem[]) => void;
  variant?: 'full' | 'compact';
}

function slugifyKey(label: string, index: number): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return base || `field_${index + 1}`;
}

const FIELD_PRESETS: { label: string; type: FieldSchemaItem['type'] }[] = [
  { label: 'Текст', type: 'text' },
  { label: 'Описание', type: 'textarea' },
  { label: 'Дата', type: 'date' },
  { label: 'Число', type: 'number' },
  { label: 'Да/Нет', type: 'boolean' },
  { label: 'Список', type: 'select' },
  { label: 'Сотрудник', type: 'user_ref' },
];

export function FieldSchemaEditor({
  value,
  onChange,
  variant = 'full',
}: FieldSchemaEditorProps) {
  const updateField = (index: number, patch: Partial<FieldSchemaItem>) => {
    onChange(
      value.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    );
  };

  const removeField = (index: number) => {
    onChange(value.filter((_, fieldIndex) => fieldIndex !== index));
  };

  const addField = () => {
    onChange([...value, emptyField()]);
  };

  const addPreset = (preset: (typeof FIELD_PRESETS)[number]) => {
    const index = value.length;
    onChange([
      ...value,
      {
        key: slugifyKey(preset.label, index),
        label: preset.label,
        type: preset.type,
        required: false,
        options:
          preset.type === 'select'
            ? [
                { value: 'option_1', label: 'Вариант 1' },
                { value: 'option_2', label: 'Вариант 2' },
              ]
            : undefined,
      },
    ]);
  };

  if (variant === 'compact') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FIELD_PRESETS.map((preset) => (
            <Button
              key={preset.type + preset.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addPreset(preset)}
            >
              <Plus className="h-3.5 w-3.5" />
              {preset.label}
            </Button>
          ))}
        </div>

        {value.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Нажмите кнопку выше, чтобы добавить поле. Справа — превью формы.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Подпись</th>
                  <th className="px-3 py-2 font-medium">Тип</th>
                  <th className="px-3 py-2 font-medium">*</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {value.map((field, index) => (
                  <Fragment key={`${field.key || 'field'}-${index}`}>
                    <tr>
                      <td className="px-3 py-2">
                        <Input
                          value={field.label}
                          placeholder="Название поля"
                          onChange={(event) => {
                            const label = event.target.value;
                            const patch: Partial<FieldSchemaItem> = { label };
                            if (!field.key || field.key === slugifyKey(field.label, index)) {
                              patch.key = slugifyKey(label, index);
                            }
                            updateField(index, patch);
                          }}
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={field.type}
                          onValueChange={(nextType) =>
                            updateField(index, {
                              type: nextType,
                              options:
                                nextType === 'select'
                                  ? field.options ?? [
                                      { value: 'option_1', label: 'Вариант 1' },
                                    ]
                                  : undefined,
                            })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_SCHEMA_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) =>
                            updateField(index, { required: event.target.checked })
                          }
                          className="h-4 w-4 rounded border-input"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeField(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                    {field.type === 'select' ? (
                      <tr>
                        <td colSpan={4} className="bg-muted/10 px-3 py-2">
                          <textarea
                            value={optionsToText(field.options)}
                            onChange={(event) =>
                              updateField(index, { options: textToOptions(event.target.value) })
                            }
                            rows={2}
                            className="w-full rounded-md border border-input bg-field px-2 py-1.5 font-mono text-xs"
                            placeholder="value|Подпись"
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Дополнительные поля не заданы — форма будет содержать только название запроса.
        </p>
      ) : null}

      {value.map((field, index) => (
        <div
          key={`${field.key || 'field'}-${index}`}
          className="space-y-3 rounded-lg border border-border/70 bg-muted/15 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Поле {index + 1}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeField(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ключ</Label>
              <Input
                value={field.key}
                placeholder="budget_amount"
                onChange={(event) => updateField(index, { key: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Подпись</Label>
              <Input
                value={field.label}
                placeholder="Сумма"
                onChange={(event) => updateField(index, { label: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Тип</Label>
              <Select
                value={field.type}
                onValueChange={(nextType) =>
                  updateField(index, {
                    type: nextType,
                    options: nextType === 'select' ? field.options ?? [] : undefined,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_SCHEMA_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(event) => updateField(index, { required: event.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Обязательное
            </label>
          </div>

          {field.type === 'select' ? (
            <div className="space-y-2">
              <Label>Варианты (value|подпись, по одному на строку)</Label>
              <textarea
                value={optionsToText(field.options)}
                onChange={(event) =>
                  updateField(index, { options: textToOptions(event.target.value) })
                }
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-input bg-field px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder={'low|Низкий\nnormal|Обычный\nhigh|Высокий'}
              />
            </div>
          ) : null}
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addField}>
        <Plus className="h-4 w-4" />
        Добавить поле
      </Button>
    </div>
  );
}

export function validateFieldSchemaEditor(schema: FieldSchemaItem[]): string | null {
  const keys = new Set<string>();
  const keyPattern = /^[a-z][a-z0-9_]*$/;

  for (const field of schema) {
    const key = field.key.trim();
    const label = field.label.trim();

    if (!keyPattern.test(key)) {
      return 'Ключ поля: только латиница (a–z), цифры и _; начинается с буквы (например: due_date)';
    }

    if (keys.has(key)) {
      return `Повторяющийся ключ: ${key}`;
    }
    keys.add(key);

    if (!label) {
      return `Укажите подпись для поля «${key}»`;
    }

    if (field.type === 'select' && (!field.options || field.options.length === 0)) {
      return `Добавьте варианты для поля «${label}»`;
    }
  }

  return null;
}
