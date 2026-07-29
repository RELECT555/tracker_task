/** Локализует сообщения API для админки (на случай старых/DTO-ошибок). */
const EXACT: Record<string, string> = {
  'code must contain lowercase letters, numbers, and underscores':
    'Код типа: только латиница в нижнем регистре, цифры и подчёркивание; начинается с буквы (например: contract_approval)',
  'Name is required': 'Укажите название',
  'Full name is required': 'Укажите ФИО пользователя',
  'User cannot be their own manager': 'Пользователь не может быть своим руководителем',
  'User must have at least one role': 'У пользователя должна быть хотя бы одна роль',
  'At least one route step is required': 'Добавьте хотя бы один шаг маршрута',
  'Cannot publish route template without steps': 'Нельзя опубликовать маршрут без шагов',
  'A draft version already exists. Edit or publish it first.':
    'Черновик версии уже есть. Отредактируйте или опубликуйте его.',
  'Published route templates cannot be edited. Create a new version.':
    'Опубликованный маршрут нельзя изменить. Создайте новую версию.',
  'Set a default route template, or enable personal route':
    'Укажите маршрут по умолчанию или включите персональный маршрут',
  'fieldSchema must be an array': 'Список полей формы должен быть массивом',
};

const PATTERNS: { re: RegExp; to: (match: RegExpMatchArray) => string }[] = [
  {
    re: /^Request type with code "(.+)" already exists$/,
    to: (m) => `Тип с кодом «${m[1]}» уже существует`,
  },
  {
    re: /^Unknown roles:\s*(.+)$/,
    to: (m) => `Неизвестные роли: ${m[1]}`,
  },
  {
    re: /^Duplicate field key:\s*(.+)$/,
    to: (m) => `Повторяющийся ключ поля: «${m[1]}»`,
  },
  {
    re: /^Field "(.+)" requires options$/,
    to: (m) => `Поле «${m[1]}»: добавьте хотя бы один вариант списка`,
  },
  {
    re: /^Unsupported field type:\s*(.+)$/,
    to: (m) => `Неподдерживаемый тип поля: «${m[1]}»`,
  },
  {
    re: /^Unsupported assignee type:\s*(.+)$/,
    to: (m) => `Неподдерживаемый тип назначения: «${m[1]}»`,
  },
  {
    re: /^Unsupported action:\s*(.+)$/,
    to: (m) => `Неподдерживаемое действие: «${m[1]}»`,
  },
  {
    re: /^code must be longer than or equal to (\d+)/i,
    to: () => 'Укажите код типа запроса',
  },
  {
    re: /^name must be longer than or equal to (\d+)/i,
    to: () => 'Укажите название',
  },
  {
    re: /^code must be a string$/i,
    to: () => 'Укажите код типа запроса',
  },
  {
    re: /^name must be a string$/i,
    to: () => 'Укажите название',
  },
  {
    re: /must be a UUID/i,
    to: () => 'Некорректный идентификатор (ожидается UUID)',
  },
  {
    re: /should not exist/i,
    to: () => 'Отправлены лишние поля, которых API не принимает',
  },
];

function localizeOne(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return 'Не удалось сохранить. Проверьте заполненные поля.';

  if (EXACT[trimmed]) return EXACT[trimmed];

  for (const { re, to } of PATTERNS) {
    const match = trimmed.match(re);
    if (match) return to(match);
  }

  // Уже на русском или неизвестное — показываем как есть
  return trimmed;
}

export function formatAdminApiError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Не удалось сохранить. Попробуйте ещё раз.';
  }

  const raw = error.message;
  if (raw.includes('; ')) {
    return raw
      .split('; ')
      .map((part) => localizeOne(part))
      .join('. ');
  }

  return localizeOne(raw);
}
