export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Secondary line under the title. Long text is clamped by the viewport. */
  description?: string;
  /** Auto-dismiss delay in ms. Pass `Infinity` to keep it until dismissed. */
  duration?: number;
  action?: ToastAction;
  /** Reuse an id to replace an existing toast instead of stacking a new one. */
  id?: string;
}

export interface ToastItem extends Required<Pick<ToastOptions, 'duration'>> {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  action?: ToastAction;
  createdAt: number;
}

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  // Errors stay until the user reads them — they usually carry a server message
  error: 9000,
};

/** Newest first; older toasts beyond this are dropped so the stack stays readable. */
const MAX_VISIBLE = 4;

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeToToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts() {
  return toasts;
}

export function dismissToast(id: string) {
  const next = toasts.filter((item) => item.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

function push(variant: ToastVariant, title: string, options: ToastOptions = {}) {
  counter += 1;
  const id = options.id ?? `toast-${counter}`;
  const item: ToastItem = {
    id,
    variant,
    title,
    description: options.description,
    action: options.action,
    duration: options.duration ?? DEFAULT_DURATIONS[variant],
    createdAt: Date.now(),
  };

  toasts = [item, ...toasts.filter((existing) => existing.id !== id)].slice(0, MAX_VISIBLE);
  emit();
  return id;
}

export const toast = {
  success: (title: string, options?: ToastOptions) => push('success', title, options),
  error: (title: string, options?: ToastOptions) => push('error', title, options),
  warning: (title: string, options?: ToastOptions) => push('warning', title, options),
  info: (title: string, options?: ToastOptions) => push('info', title, options),
  dismiss: dismissToast,
};
