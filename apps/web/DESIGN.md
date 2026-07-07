# DESIGN.md — Request Tracker (Web)

## Theme

Product UI. Dual theme: light content + dark sidebar (light mode); dark charcoal content + deeper sidebar (dark mode). Register: corporate workflow tool, not marketing.

## Color

### Strategy

Restrained: tinted neutrals + indigo/violet accent ≤15% of surface. Semantic status colors (blue, amber, green, red) only on badges and SLA.

### Light

| Token | Value | Role |
|-------|-------|------|
| background | hsl(210 20% 98%) | Page canvas |
| foreground | hsl(222 47% 11%) | Body text |
| card | hsl(0 0% 100%) | Raised surfaces |
| primary | hsl(239 84% 67%) | Actions, focus ring |
| muted-foreground | hsl(215 16% 47%) | Secondary text |
| sidebar-background | hsl(240 6% 7%) | Nav anchor (dark panel) |
| sidebar-primary | hsl(258 90% 76%) | Active nav accent |

### Dark

| Token | Value | Role |
|-------|-------|------|
| background | hsl(0 0% 5%) | Soft charcoal |
| foreground | hsl(0 0% 95%) | Body text |
| card | hsl(0 0% 8%) | Cards |
| primary | hsl(258 90% 76%) | Actions |
| sidebar-background | hsl(248 14% 11%) | Sidebar depth |

Use CSS variables in `src/app/globals.css`. Prefer `bg-card`, `text-muted-foreground`, `border-border` — never raw hex in components.

## Typography

| Role | Family | Notes |
|------|--------|-------|
| UI / body | Inter (next/font, cyrillic) | 400 body, 500 labels, 600 headings |
| Mono | JetBrains Mono | IDs, codes |

Scale: xs 12px, sm 14px (tables), base 16px, lg 18px, xl 20px (page titles), 2xl 24px.

## Spacing & Radius

Spacing: Tailwind 4px base — 1/2/4/6/8 for icon gap, badge, card, section, page.

Radius: sm 6px (badges), md 8px (inputs), lg 12px (cards), `--radius: 0.5rem`.

## Layout

- Sidebar 256px (`--sidebar-width: 16rem`), sticky
- Header h-16, backdrop-blur
- Content max-w-7xl, page fade-in
- Dashboard grid: inbox table → cards on md breakpoint

## Components

shadcn-style in `src/shared/ui/`: Button (6 variants), Card, Input, Select, Alert, Skeleton, EmptyState, PageContainer.

Entity badges: `RequestStatusBadge`, `RouteStepStatusBadge` — rounded-full, semantic bg/text pairs with `dark:` overrides.

Icons: Lucide only, 16px inline, 20px nav, stroke 1.5.

## Motion

Subtle: fade-in, slide-in-from-bottom-2 on page enter; skeleton shimmer; 200ms theme transition on html. No bounce. Respect prefers-reduced-motion.

## Do / Don't

| Do | Don't |
|----|-------|
| Semantic tokens | Hardcoded colors |
| Test light + dark | Light-only polish |
| Skeleton loading | Full-screen spinner |
| Table clarity in Inbox | Decorative card grids for data |
