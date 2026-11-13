'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Input } from '@/shared/ui/input';

export type FaqItem = {
  id: string;
  question: string;
  answer: ReactNode;
  searchText?: string;
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'import-roles',
    question: 'Откуда берутся роли и плановые часы?',
    answer: <>На странице «План проекта» кнопка «Загрузить проект из Azure» загружает задачи и роли из вкладки Roles Estimate. В плане Roadmap видны оценки по роли на всю задачу. Участников настраивают в разделе «Роли и участники», а их квартальные часы сохраняются в плане.</>,
  },
  {
    id: 'what-is-two-way-sync',
    question: 'Что такое обратная синхронизация?',
    answer: <>Roadmap создаёт в Azure DevOps по задаче на каждое назначение (фича × роль × человек × квартал) и держит в ней оценку и исполнителя. Люди списывают время в эту задачу, и факт возвращается в Roadmap.</>,
  },
  {
    id: 'when-plan-is-filled',
    question: 'Что происходит, когда я заполняю план?',
    answer: <>Зависит от режима. <strong>Выключено:</strong> в Azure ничего не уходит, назначения помечаются «не отправлено». <strong>По кнопке:</strong> изменения копятся, в шапке плана появляется кнопка «Отправить в Azure (N)» с предпросмотром. <strong>Автоматически:</strong> каждое сохранённое назначение уходит через несколько секунд.</>,
  },
  {
    id: 'what-appears-in-azure',
    question: 'Что появится в Azure?',
    answer: <>Например, «Backend: Заявки (Q4 2026)» под фичей «Заявки», исполнитель — Иван, Original Estimate и Remaining Work = 40, теги Roadmap, Roadmap 2026-Q4, Backend и итерация квартала, если она найдена. Состав полей настраивается в разделе «Поля задач».</>,
  },
  {
    id: 'plan-changes',
    question: 'Что если я поменяю часы, человека, месяцы или квартал?',
    answer: <>При изменении часов обновится оценка той же задачи, а Remaining Work пересчитается или останется по настройке. При смене человека задача переназначится. Помесячная разбивка в Azure не уходит. Другой квартал — это отдельное назначение и отдельная задача.</>,
  },
  {
    id: 'fact-source',
    question: 'Откуда факт и когда обновляется?',
    answer: <>По умолчанию фактические часы берутся из Completed Work. После первой загрузки Roadmap проверяет изменения в Azure каждые 5 минут. Чтобы обновить проект сразу, нажмите «Обновить проект из Azure» во вкладке «Проекты».</>,
  },
  {
    id: 'manual-changes',
    question: 'Что можно менять в Azure руками?',
    answer: <>Название, состояние, описание, комментарии и факт менять можно. Поля из правил записи (оценка, исполнитель и другие) менять не следует: Roadmap обнаружит правку и поступит по политике конфликтов.</>,
  },
  {
    id: 'skipped-assignment',
    question: 'Почему назначение «пропущено»?',
    answer: <>Назначение пропускается для демо-участника, проекта вне выбранной области записи или человека без учётной записи Azure.</>,
  },
  {
    id: 'sync-error',
    question: 'Что делать при ошибке?',
    answer: <>Откройте назначение или найдите его в блоке «Ошибки отправки» на вкладке «Проекты». Исправьте причину ошибки и нажмите «Отправить снова».</>,
  },
  {
    id: 'rollback',
    question: 'Как остановить отправку изменений?',
    answer: <>Во вкладке «Запись в Azure» выберите режим «Выключено» и сохраните настройки. Уже созданные задачи можно проверить в Azure DevOps.</>,
  },
  {
    id: 'custom-fields',
    question: 'Как писать в кастомные поля и брать факт из своего поля?',
    answer: <>В разделе «Поля задач» выберите поле Azure и источник значения. Там же задаётся источник факта.</>,
  },
  {
    id: 'webhook-needed',
    question: 'Нужен ли webhook?',
    answer: <>Webhook нужен, чтобы быстрее получать изменения, а также обрабатывать удаления и конфликты. Для обновления по расписанию webhook не требуется. Чтобы подключить его, откройте Azure DevOps доступ к API Roadmap.</>,
  },
  {
    id: 'pat-permissions',
    question: 'Какие права нужны PAT?',
    answer: <>Project and Team: Read, Graph: Read, Work Items: Read. Для записи добавьте Work Items: Read &amp; Write.</>,
  },
  {
    id: 'push-permissions',
    question: 'Кто может отправлять в Azure?',
    answer: <>Это задаётся настройкой: только администраторы или все, кто планирует.</>,
  },
  {
    id: 'manual-or-auto',
    question: 'Чем «По кнопке» отличается от «Автоматически» и что выбрать?',
    answer: <>Начните с режима «По кнопке» на одном проекте. Когда задачи выглядят как нужно, включайте «Автоматически».</>,
  },
];

export function FaqAccordion({ connected }: { connected: boolean }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const items = useMemo(() => FAQ_ITEMS.filter((item) => {
    if (!normalizedQuery) return true;
    const text = `${item.question} ${item.searchText ?? ''} ${typeof item.answer === 'string' ? item.answer : JSON.stringify(item.answer)}`;
    return text.toLocaleLowerCase('ru-RU').includes(normalizedQuery);
  }), [normalizedQuery]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по вопросам и ответам" className="pl-9" aria-label="Поиск по FAQ" />
      </div>
      {items.length ? <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {items.map((item) => <details key={item.id} id={`faq-${item.id}`} className="group scroll-mt-4 bg-card px-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm py-3.5 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform group-open:rotate-180" />
          </summary>
          <div className="max-w-3xl pb-4 pr-7 text-sm leading-relaxed text-muted-foreground">
            {item.answer}
            {item.id === 'fact-source' ? (
              <a href={connected ? '#azure-task-sync' : '#azure-connection'} className="mt-2 block w-fit rounded font-medium text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                {connected ? 'К синхронизации проектов' : 'Подключить Azure DevOps'}
              </a>
            ) : null}
          </div>
        </details>)}
      </div> : <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">По этому запросу ничего не найдено.</p>}
    </div>
  );
}
