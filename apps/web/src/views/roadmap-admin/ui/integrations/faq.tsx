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
    answer: <>Например, «Backend: Заявки (Q4 2026)» под фичей «Заявки», исполнитель — Иван, Original Estimate и Remaining Work = 40, теги Roadmap, Roadmap 2026-Q4, Backend и итерация квартала, если она найдена. Состав полей настраивается во вкладке «Маппинг полей».</>,
  },
  {
    id: 'plan-changes',
    question: 'Что если я поменяю часы, человека, месяцы или квартал?',
    answer: <>При изменении часов обновится оценка той же задачи, а Remaining Work пересчитается или останется по настройке. При смене человека задача переназначится. Помесячная разбивка в Azure не уходит. Другой квартал — это отдельное назначение и отдельная задача.</>,
  },
  {
    id: 'fact-source',
    question: 'Откуда факт и когда обновляется?',
    answer: <>Факт берётся из поля факта задачи, по умолчанию Completed Work. С webhook он обновляется через секунды, без webhook — кнопками «Синхронизировать» на плане или «Загрузить из Azure» в интеграциях.</>,
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
    answer: <>Откройте назначение или раздел «Проекты и статус → Ошибки», прочитайте причину, исправьте права PAT, поле или исполнителя и нажмите «Отправить снова».</>,
  },
  {
    id: 'rollback',
    question: 'Можно ли откатить?',
    answer: <>Да. В разделе «Проекты и статус → Откат» можно выбрать задачи, созданные Roadmap, и закрыть или удалить их в корзину Azure после подтверждения. Режим «Выключено» останавливает новые отправки.</>,
  },
  {
    id: 'custom-fields',
    question: 'Как писать в кастомные поля и брать факт из своего поля?',
    answer: <>Во вкладке «Маппинг полей» выберите поле Azure и источник значения. Там же задаётся источник факта.</>,
  },
  {
    id: 'webhook-needed',
    question: 'Нужен ли webhook?',
    answer: <>Webhook не обязателен, но без него факт и конфликты видны только после ручной загрузки. API должен быть доступен из интернета.</>,
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

export function FaqAccordion() {
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
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по вопросам и ответам" className="pl-9" aria-label="Поиск по FAQ" />
      </div>
      {items.length ? <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {items.map((item) => <details key={item.id} id={`faq-${item.id}`} className="group bg-card px-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="max-w-3xl pb-4 pr-7 text-sm leading-relaxed text-muted-foreground">{item.answer}</div>
        </details>)}
      </div> : <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">По этому запросу ничего не найдено.</p>}
    </div>
  );
}
