"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTE_STEP_ACTIONS = exports.ASSIGNEE_TYPES = exports.ROUTE_STEP_STATUSES = void 0;
exports.ROUTE_STEP_STATUSES = ['active', 'pending', 'completed', 'skipped'];
exports.ASSIGNEE_TYPES = [
    'user',
    'role',
    'org_unit_head',
    'manager_chain',
    'dynamic',
    'pool',
];
exports.ROUTE_STEP_ACTIONS = ['approve', 'reject', 'escalate', 'request_info'];
