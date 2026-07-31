# 10 — Design System

Единая визуальная система для Wayo. Основана на **shadcn/ui + Tailwind CSS** с парой гармоничных тем: светлой и тёмной. Обе темы используют одну цветовую «семью» (slate + indigo), чтобы переключение не ломало восприятие интерфейса.

## Принципы

1. **Гармония тем** — light и dark не зеркальные инверсии, а две версии одной палитры с одинаковым акцентом и семантикой.
2. **Clarity first** — корпоративный инструмент: читаемость таблиц, статусов и SLA важнее декора.
3. **Семантика через цвет** — статус запроса, приоритет и SLA всегда имеют предсказуемый цвет в обеих темах.
4. **Accessible** — контраст текста минимум WCAG AA (4.5:1 для body, 3:1 для крупного текста и UI-элементов).
5. **Consistency** — один spacing scale, один radius scale, одна типографика.

## Стек реализации

| Инструмент | Роль |
|------------|------|
| shadcn/ui | Базовые компоненты |
| Tailwind CSS | Utility-классы |
| CSS variables | Токены тем (`:root` / `.dark`) |
| next-themes | Переключение light / dark / system |
| class-variance-authority (cva) | Варианты компонентов (badge, button) |
| Lucide React | Иконки, stroke-width: 1.5 |

---

## Типографика

### Шрифты

| Роль | Шрифт | Fallback |
|------|-------|----------|
| UI / Body | **Inter** | system-ui, sans-serif |
| Monospace (ID, коды) | **JetBrains Mono** | ui-monospace, monospace |

```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

Подключение через `next/font/google` — без layout shift.

### Scale

| Token | Size | Line height | Использование |
|-------|------|-------------|---------------|
| `text-xs` | 12px | 16px | Метки SLA, timestamps |
| `text-sm` | 14px | 20px | Таблицы, вторичный текст |
| `text-base` | 16px | 24px | Основной текст, формы |
| `text-lg` | 18px | 28px | Заголовки карточек |
| `text-xl` | 20px | 28px | Заголовки страниц |
| `text-2xl` | 24px | 32px | Hero / dashboard title |

### Weight

- `font-normal` (400) — body
- `font-medium` (500) — labels, table headers
- `font-semibold` (600) — заголовки, активные пункты sidebar

---

## Spacing & Radius

### Spacing (Tailwind default, 4px base)

| Token | Value | Пример |
|-------|-------|--------|
| `space-1` | 4px | Gap между иконкой и текстом |
| `space-2` | 8px | Padding badge |
| `space-4` | 16px | Padding card |
| `space-6` | 24px | Gap между секциями |
| `space-8` | 32px | Page padding |

### Radius

| Token | Value | Использование |
|-------|-------|---------------|
| `--radius-sm` | 6px | Badges, chips |
| `--radius-md` | 8px | Inputs, buttons |
| `--radius-lg` | 12px | Cards, dialogs |
| `--radius-xl` | 16px | Modals, panels |

---

## Цветовая палитра

### Базовая идея

- **Нейтрали:** slate (холодный серый) — профессиональный, не «офисный» серый.
- **Акцент:** indigo — доверие, спокойствие, хорошо читается и на белом, и на тёмном фоне.
- **Семантика:** green / amber / red / blue — одинаковый hue в обеих темах, меняется только lightness.

---

## Light Theme

```css
:root {
  /* Surfaces */
  --background:           210 20% 98%;      /* #F8F9FB — тёплый off-white */
  --foreground:           222 47% 11%;      /* #0F172A — slate-900 */

  --card:                 0 0% 100%;        /* #FFFFFF */
  --card-foreground:      222 47% 11%;

  --popover:              0 0% 100%;
  --popover-foreground:   222 47% 11%;

  /* Primary — indigo */
  --primary:              239 84% 67%;      /* #6366F1 — indigo-500 */
  --primary-foreground:   0 0% 100%;

  /* Secondary */
  --secondary:            214 32% 91%;      /* #E2E8F0 — slate-200 */
  --secondary-foreground: 222 47% 11%;

  /* Muted */
  --muted:                210 40% 96%;      /* #F1F5F9 — slate-100 */
  --muted-foreground:     215 16% 47%;      /* #64748B — slate-500 */

  /* Accent (hover, selected) */
  --accent:               214 32% 91%;
  --accent-foreground:    222 47% 11%;

  /* Destructive */
  --destructive:          0 84% 60%;        /* #EF4444 */
  --destructive-foreground: 0 0% 100%;

  /* Borders & inputs */
  --border:               214 32% 91%;
  --input:                214 32% 91%;
  --ring:                 239 84% 67%;      /* focus ring = primary */

  /* Sidebar */
  --sidebar-background:   222 47% 11%;      /* #0F172A — тёмный sidebar на светлой теме */
  --sidebar-foreground:   210 40% 96%;
  --sidebar-primary:      239 84% 67%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent:       217 33% 17%;      /* hover item */
  --sidebar-accent-foreground: 210 40% 96%;
  --sidebar-border:       217 33% 17%;
  --sidebar-ring:         239 84% 67%;

  --radius: 0.5rem;
}
```

**Особенность light:** sidebar тёмный (slate-900) — контрастный якорь, контентная зона светлая. Так inbox-таблицы не «растворяются» и navigation всегда на месте.

---

## Dark Theme

```css
.dark {
  /* Surfaces — не pure black, а slate-950 с лёгким синим */
  --background:           222 47% 6%;       /* #0B0F19 */
  --foreground:           210 40% 96%;      /* #F1F5F9 */

  --card:                 222 47% 9%;       /* #111827 — приподнятая поверхность */
  --card-foreground:      210 40% 96%;

  --popover:              222 47% 9%;
  --popover-foreground:   210 40% 96%;

  /* Primary — тот же indigo, чуть светлее для контраста на тёмном */
  --primary:              239 84% 67%;      /* #6366F1 — идентичен light */
  --primary-foreground:   0 0% 100%;

  --secondary:            217 33% 17%;      /* #1E293B — slate-800 */
  --secondary-foreground: 210 40% 96%;

  --muted:                217 33% 17%;
  --muted-foreground:     215 20% 65%;      /* #94A3B8 — slate-400 */

  --accent:               217 33% 17%;
  --accent-foreground:    210 40% 96%;

  --destructive:          0 63% 51%;        /* #DC2626 — чуть приглушённее */
  --destructive-foreground: 0 0% 100%;

  --border:               217 33% 17%;
  --input:                217 33% 17%;
  --ring:                 239 84% 67%;

  /* Sidebar — чуть темнее card для depth */
  --sidebar-background:   222 47% 4%;       /* #080B12 */
  --sidebar-foreground:   210 40% 96%;
  --sidebar-primary:      239 84% 67%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent:       217 33% 12%;
  --sidebar-accent-foreground: 210 40% 96%;
  --sidebar-border:       217 33% 12%;
  --sidebar-ring:         239 84% 67%;
}
```

**Гармония:** primary indigo **одинаковый** в обеих темах — кнопки, links, focus ring узнаваемы при переключении. Меняются только surfaces и neutrals.

---

## Семантические цвета

Используются для статусов, приоритетов, SLA. Определены отдельно от shadcn tokens — в `tailwind.config.ts` как custom colors.

### Статусы запроса

| Status | Label (RU) | Light bg | Light text | Dark bg | Dark text | Icon |
|--------|------------|----------|------------|---------|-----------|------|
| `draft` | Черновик | `slate-100` | `slate-600` | `slate-800` | `slate-400` | `FileEdit` |
| `submitted` | Отправлен | `blue-50` | `blue-700` | `blue-950` | `blue-300` | `Send` |
| `in_progress` | В работе | `indigo-50` | `indigo-700` | `indigo-950` | `indigo-300` | `Clock` |
| `pending_info` | Уточнение | `amber-50` | `amber-700` | `amber-950` | `amber-300` | `MessageCircleQuestion` |
| `approved` | Одобрен | `green-50` | `green-700` | `green-950` | `green-300` | `CheckCircle2` |
| `rejected` | Отклонён | `red-50` | `red-700` | `red-950` | `red-300` | `XCircle` |
| `cancelled` | Отменён | `slate-100` | `slate-500` | `slate-800` | `slate-500` | `Ban` |

### Приоритеты

| Priority | Label (RU) | Color | Поведение |
|----------|------------|-------|-----------|
| `low` | Низкий | `slate-400` | Только dot, без акцента |
| `normal` | Обычный | — | Не отображается |
| `high` | Высокий | `amber-500` | Orange dot + label |
| `urgent` | Срочный | `red-500` | Red dot + label + bold row |

### SLA-индикаторы

| Состояние | Light | Dark | Иконка |
|-----------|-------|------|--------|
| > 50% времени | `text-slate-500` | `text-slate-400` | `Clock` |
| < 50% времени | `text-amber-600` | `text-amber-400` | `Clock` |
| < 4 часа | `text-orange-600` | `text-orange-400` | `AlertTriangle` |
| Просрочен | `text-red-600` | `text-red-400` | `AlertCircle` + pulse |

### Шаги маршрута (Timeline)

| Step status | Icon color (light) | Icon color (dark) | Symbol |
|-------------|-------------------|-------------------|--------|
| `completed` | `green-600` | `green-400` | ✓ filled circle |
| `active` | `indigo-600` | `indigo-400` | ● ring + pulse |
| `pending` | `slate-300` | `slate-600` | ○ empty circle |
| `skipped` | `slate-400` | `slate-500` | ⊘ dashed |

---

## Компоненты

### UI Kit (`shared/ui/`)

| Компонент | Файл | Назначение |
|-----------|------|------------|
| `Button` | `button.tsx` | 6 variants: default, destructive, outline, secondary, ghost, link |
| `Input` | `input.tsx` | Текстовые поля с focus ring |
| `Select` | `select.tsx` | Native select с иконкой chevron |
| `Label` | `label.tsx` | Подписи полей форм |
| `Card` | `card.tsx` | Card, Header, Title, Description, Content, Footer |
| `Alert` | `alert.tsx` | default, destructive, warning, success |
| `Skeleton` | `skeleton.tsx` | Shimmer + TableSkeleton, FormSkeleton |
| `EmptyState` | `empty-state.tsx` | Пустые списки с иконкой и action |
| `PageContainer` | `page-container.tsx` | max-w-7xl + fade-in анимация |

Утилита `cn()` — `shared/lib/utils.ts` (clsx + tailwind-merge).

### Layout

| Компонент | Ширина / поведение |
|-----------|-------------------|
| Sidebar | 256px (`--sidebar-width`), sticky, user footer |
| Header | h-16, backdrop-blur, subtitle опционально |
| Content | max-w-7xl, px responsive, page enter animation |

### Анимации (`globals.css`)

- `fade-in`, `slide-in-from-bottom-2`, `zoom-in-95` — вход страниц
- `skeleton-shimmer` — загрузка
- `animate-spin` — кнопки submit
- Theme transition 200ms на `html`

### RequestStatusBadge

```typescript
// entities/request/ui/RequestStatusBadge.tsx
const statusVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      status: {
        draft:         'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
        submitted:     'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
        in_progress:   'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
        pending_info:  'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
        approved:      'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
        rejected:      'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
        cancelled:     'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
      },
    },
  },
);
```

### Кнопки действий

| Action | Variant | Icon | Color hint |
|--------|---------|------|------------|
| Одобрить | `default` (primary) | `Check` | indigo |
| Отклонить | `destructive` | `X` | red |
| Уточнить | `outline` | `MessageCircle` | neutral |
| Эскалировать | `secondary` | `ArrowUp` | neutral |
| Отменить | `ghost` | `Ban` | muted |

### Cards

```css
/* Card — приподнятая поверхность с subtle shadow только в light */
.card {
  @apply rounded-lg border bg-card text-card-foreground;
  @apply shadow-sm dark:shadow-none;
}
```

В dark theme depth создаётся **разницей surface colors** (background → card → popover), а не shadow.

### Tables (Inbox)

| Element | Light | Dark |
|---------|-------|------|
| Header bg | `muted` | `muted` |
| Row hover | `accent` | `accent` |
| Row border | `border` | `border` |
| Urgent row | `bg-red-50/50` | `bg-red-950/20` |
| Overdue SLA | `text-red-600 font-medium` | `text-red-400 font-medium` |

### Sidebar

- Light theme: **тёмный sidebar** (`--sidebar-background: slate-900`) — контент светлый.
- Dark theme: sidebar **ещё темнее** card — создаёт глубину.
- Active item: `sidebar-primary` left border 3px + `sidebar-accent` bg.
- Icons: Lucide, 20px, `sidebar-foreground/70` → `sidebar-foreground` on hover.

---

## Переключение темы

### next-themes

```typescript
// app/providers.tsx
import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      {children}
    </ThemeProvider>
  );
}
```

### Theme Toggle (Header)

```typescript
// widgets/header/ThemeToggle.tsx
// Три состояния: Light | Dark | System
// Иконки: Sun (light), Moon (dark), Monitor (system)
// Dropdown через shadcn DropdownMenu
```

Расположение: правый верхний угол Header, рядом с уведомлениями и аватаром.

### Плавный переход

```css
/* globals.css */
html {
  transition: background-color 0.2s ease, color 0.2s ease;
}
```

`disableTransitionOnChange={false}` + CSS transition — мягкое переключение без мигания.

---

## Layout

### Breakpoints

| Name | Width | Поведение |
|------|-------|-----------|
| `sm` | 640px | Sidebar collapses to icons |
| `md` | 768px | Table → card list |
| `lg` | 1024px | Full sidebar + content |
| `xl` | 1280px | Request detail: 2-column layout |

### Grid (Request Detail)

```
lg+:  [ Fields + Comments (60%) | Route Timeline + Actions (40%) ]
md:   [ Fields ] [ Timeline ] [ Actions ] — stacked
```

### Page structure

```
┌─ Sidebar (240px / 64px collapsed) ─┬─ Header (56px) ──────────────┐
│                                     ├─ Page title + breadcrumbs ───┤
│  Logo                               ├─ Content (p-6, max-w-7xl) ───┤
│  Nav items                          │                              │
│  ─────                              │                              │
│  User menu                          │                              │
└─────────────────────────────────────┴──────────────────────────────┘
```

---

## Иконки

| Категория | Размер | Stroke |
|-----------|--------|--------|
| Navigation | 20px | 1.5 |
| Inline (badge, button) | 16px | 1.5 |
| Empty states | 48px | 1 |
| Timeline steps | 20px | 2 |

Библиотека: **Lucide React**. Не смешивать с другими icon sets.

---

## Empty & Loading States

| State | Pattern |
|-------|---------|
| Empty inbox | Illustration-free: иконка `Inbox` 48px muted + «Нет входящих запросов» |
| Loading | shadcn `Skeleton` — pulse animation |
| Error | `Alert` variant destructive + retry button |
| 404 | Centered text + «Вернуться на главную» |

---

## Файловая структура (design tokens)

```
apps/web/src/
├── app/
│   └── globals.css              # :root + .dark CSS variables
├── shared/
│   ├── config/
│   │   └── theme.ts             # STATUS_COLORS, PRIORITY_COLORS constants
│   └── ui/                      # shadcn components
│       ├── button.tsx
│       ├── badge.tsx
│       └── ...
└── tailwind.config.ts           # extend colors from CSS vars
```

### globals.css (фрагмент)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* ... light tokens из секции выше ... */
  }

  .dark {
    /* ... dark tokens из секции выше ... */
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

### tailwind.config.ts (фрагмент)

```typescript
theme: {
  extend: {
    colors: {
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      // ... остальные shadcn tokens
      sidebar: {
        DEFAULT: 'hsl(var(--sidebar-background))',
        foreground: 'hsl(var(--sidebar-foreground))',
        primary: 'hsl(var(--sidebar-primary))',
        'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
        accent: 'hsl(var(--sidebar-accent))',
        'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
        border: 'hsl(var(--sidebar-border))',
        ring: 'hsl(var(--sidebar-ring))',
      },
    },
    borderRadius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
  },
},
```

---

## Do & Don't

| Do | Don't |
|----|-------|
| Использовать semantic tokens (`bg-card`, `text-muted-foreground`) | Hardcode `#FFFFFF` / `#000000` |
| Проверять UI в обеих темах | Тестировать только light |
| Один primary indigo для акцентов | Разные accent colors в light/dark |
| `dark:` prefix для semantic overrides | Отдельные компоненты для тем |
| Skeleton при загрузке | Spinner на весь экран |

---

## Связанные документы

- [Фронтенд-архитектура](07-frontend-architecture.md)
- [Общая архитектура](03-architecture.md)
- [Гайд по разработке](09-development-guide.md)
