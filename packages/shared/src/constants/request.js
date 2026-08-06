"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSITION_ACTION_LABELS = exports.PRIORITY_LABELS = exports.STATUS_LABELS = exports.ROLE_CODES = exports.REQUEST_PRIORITIES = exports.REQUEST_STATUSES = void 0;
exports.REQUEST_STATUSES = [
    'draft',
    'submitted',
    'in_progress',
    'pending_info',
    'approved',
    'rejected',
    'cancelled',
];
exports.REQUEST_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
exports.ROLE_CODES = [
    'employee',
    'manager',
    'director',
    'admin',
    'observer',
];
exports.STATUS_LABELS = {
    draft: 'Черновик',
    submitted: 'Отправлен',
    in_progress: 'В работе',
    pending_info: 'Уточнение',
    approved: 'Одобрен',
    rejected: 'Отклонён',
    cancelled: 'Отменён',
};
exports.PRIORITY_LABELS = {
    low: 'Низкий',
    normal: 'Обычный',
    high: 'Высокий',
    urgent: 'Срочный',
};
exports.TRANSITION_ACTION_LABELS = {
    submit: 'Отправка на согласование',
    approve: 'Согласование',
    reject: 'Отклонение',
    cancel: 'Отмена',
    request_info: 'Запрос уточнения',
    provide_info: 'Ответ на уточнение',
    escalate: 'Эскалация',
    sla_escalate: 'Автоэскалация по SLA',
};
