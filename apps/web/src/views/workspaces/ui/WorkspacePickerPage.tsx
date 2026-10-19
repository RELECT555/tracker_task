'use client';

import Link from 'next/link';
import { GitBranch, LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';

export function WorkspacePickerPage() {
  const { logout } = useAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Рабочее пространство</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Roadmap</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Планирование проектов, инициатив и загрузки команды.</p>
          </div>
          <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><LogOut className="h-4 w-4" />Выйти</button>
        </div>
        <Link href={routes.roadmap} className="mt-8 flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><GitBranch className="h-5 w-5" /></span>
          <span><span className="block font-medium text-foreground">Открыть Roadmap</span><span className="mt-1 block text-sm text-muted-foreground">Перейти к плану проекта</span></span>
        </Link>
      </section>
    </main>
  );
}

