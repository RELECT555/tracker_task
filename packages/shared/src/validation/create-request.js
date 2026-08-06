"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRequestSchema = void 0;
var zod_1 = require("zod");
var request_1 = require("../constants/request");
exports.createRequestSchema = zod_1.z.object({
    typeId: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(1).max(500),
    fields: zod_1.z.record(zod_1.z.unknown()).default({}),
    priority: zod_1.z.enum(request_1.REQUEST_PRIORITIES).default('normal'),
    routeTemplateId: zod_1.z.string().uuid().nullable().optional(),
});
