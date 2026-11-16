# Roadmap workspace

Roadmap is a project planning workspace backed by Azure DevOps. It imports a project's Epics and Features and the organization's people directory. Planning data is stored in Roadmap; when plan write-back is enabled (see [Two-way sync](#two-way-sync-with-azure-devops)), each assignment is also mirrored by an Azure DevOps Task. Roadmap never changes the imported Epics and Features themselves.

## Azure DevOps connection

Roadmap administrators can open `/roadmap/admin`, then choose **Интеграции**. Enter the organization URL and a PAT with read access to Projects and Teams and Work Items. Use **Проверить доступ** to test access and **Подключить Azure DevOps** to save the connection. To update saved credentials, open **Настройки подключения**. The people directory also needs Graph read access. The PAT is stored encrypted in the database.

For local development, the API can also read a connection from `apps/api/.env`:

```env
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_PAT=your-personal-access-token
```

Set `ROADMAP_ENCRYPTION_KEY` to a stable server secret for encrypting saved credentials. If it is unset, the API uses `JWT_SECRET` as the encryption key. Changing the key makes previously stored PATs unreadable. Environment variables remain a fallback; credentials saved in Roadmap administration take precedence. Azure DevOps Services REST API 7.1 is used for projects and work items; the organization Graph users endpoint is `7.1-preview.1`.

## Import projects and roles

1. On **План проекта**, choose a project and click **Загрузить проект из Azure**. Roadmap imports the project, work items and roles from the visible numeric fields on the project's **Roles Estimate** forms. A value such as **План Azure: 32 ч** is the estimate for that role on the whole work item. Roadmap shows it alongside the quarterly assignments.
2. Open **Роли и участники** from the plan or the administration menu. Choose the project, select a role and configure its members and default assignee. Roles linked to Azure DevOps have a source badge. If the employee list is empty, import it from **Пользователи**.

Project import runs through `POST /roadmap/projects/:externalId/sync`. If the Azure process layout is unavailable or the tab has no matching fields, Roadmap still imports the work items and preserves the existing roles. See [Azure DevOps work item type layouts](https://learn.microsoft.com/en-us/rest/api/azure/devops/processes/work-item-types/list?view=azure-devops-rest-7.1).

## Planning model

- The planning table groups imported Features under their Azure DevOps Epics. Epic rows summarize the assignments and hours in their child Features.
- Each project keeps its own roles and assignments. Roles can come from Azure DevOps or from the manual role catalog.
- Choose a default person for a project role in the role directory or its table heading. This person appears on work items until a work item has its own assignment; work item changes stay local to that Feature or Epic.
- Feature cells offer only active people assigned to that project's role. Synchronize the people directory from the **Users** card after connecting Azure DevOps.
- User synchronization ignores deleted identities, profiles without an email/principal name, and known Azure DevOps service identities; excluded accounts are deactivated and hidden unless an administrator chooses to show inactive users.
- Planning is quarterly. Every person assignment belongs to one quarter (`YYYY-Qn`), and its estimate is the hours planned for that quarter. The role view has a quarter switcher and shows only the selected quarter's assignments; work that spans several quarters gets a separate assignment per quarter. Assignments created before quarterly planning were moved to 2026-Q4.
- Period (monthly) planning is currently disabled in the UI (`PERIOD_PLANNING_ENABLED` in `RoadmapPage.tsx`); only the role view is available. Existing monthly values are kept and still count toward the estimate check.
- The period view selects a quarter and shows its three months as shared project-wide buckets. Quarter navigation only filters the plan; it does not delete values in other months.
- Monthly values are non-negative half-hour increments. Their sum, including preserved legacy period estimates, cannot exceed the assignment's overall estimate. The remaining estimate is shown separately.
- Older custom date ranges are preserved and shown separately; the system does not automatically split their hours between months.

After the first import, the Roadmap API checks for new and changed work items every five minutes. It refreshes names, types, states, parent links, the standard `Completed Work` value and role estimates even when the plan is closed. Use **Обновить проект из Azure** in **Интеграции → Проекты** for a manual refresh, including the list of roles. Actual hours on Features and Epics include their own `Completed Work` plus actual hours from descendant Tasks, following intermediate parent work items. Existing planning assignments remain attached to the matching Azure DevOps work item IDs.

Use **+** in the **Эпик / фича** table heading to create an Epic, or **+** on an Epic row to create a Feature with that Epic already selected as its parent. An empty plan offers **Создать эпик**. The form still lets you change the work item type, including Task, and select a different parent. Use the person-with-plus **Добавить роль** button beside the quarter selector to add a role from the catalog.

## Two-way sync with Azure DevOps

Roadmap owns its quarterly assignments; Azure DevOps owns the source role estimates and actual hours. The **Интеграции** page has five tabs:

- **Справка** — data flow, field ownership, assignment statuses and steps for turning on write-back.
- **Запись в Azure** — mode, project scope, work item type, title/tag templates, fields to write and the Remaining Work policy.
- **Поля задач** — Azure field discovery, write/read rules, fact source, and role-to-field links.
- **Проекты** — sync status, project refresh and send errors. Open **Подробности синхронизации** on a project row to check readiness and see recent activity. To add a project, open **План проекта**.
- **Webhook** — secret and step-by-step service hook setup.

The integration overview stores the last readiness check and the last webhook event for each imported project. Assignment statuses include **sending** while a queue item is being processed and **conflict** when Azure changed a field controlled by Roadmap.

The **Поля задач** section discovers work item types, fields and states from Azure DevOps (cached for ten minutes). Settings are stored in the version 2 schema; saved version 1 settings are migrated automatically. Write rules support constants, templates, Roadmap values, parent fields and role-based values. Read rules and the fact source control additional imported fields; fields linked through **Roles Estimate** are read regardless of these rules.

**Plan → Azure DevOps (write-back).** Every assignment (work item × role × person × quarter) is mirrored by a work item (Task by default) under its Feature or Epic.

- **Mode**: *Off* (nothing is written; edits are remembered as `pending`), *Manual* (edits queue up and are sent with **Send to Azure** after a preview — recommended to start), *Automatic* (each saved assignment is sent right away; queued ones within a minute, also after an API restart). Settings saved by the first version (`writeBackEnabled: true`) are read as *Automatic*.
- **Projects**: all imported projects or only selected ones; assignments of other projects are `skipped`.
- **Templates**: title and tags accept `{role}`, `{title}`, `{quarter}` (Q4 2026), `{quarterKey}` (2026-Q4), `{person}`, `{id}`. Defaults: `{role}: {title} ({quarter})` and `Roadmap; Roadmap {quarterKey}; {role}`.
- **Fields** (each can be turned off): Assigned To (person's email/principal name), Original Estimate, Remaining Work, Iteration Path, Area Path (copied from the parent), Description. Fields missing from the project's process (for example Original Estimate in Scrum) are skipped.
- **Remaining Work policy**: *recalculate* (estimate − Completed Work on every estimate change) or *on create only*.
- Iteration Path is the iteration whose path names the quarter (`2026 Q4`, `Q4-2026`, …), otherwise the narrowest iteration whose dates span the quarter, otherwise the project default.
- **Preview** lists what will be created, updated (with the old → new estimate) or skipped and why; you can untick assignments before sending.
- If Azure does not confirm creation, **Send again** looks for the task by its Roadmap tag. If the task is still unconfirmed, the assignment stays in error for review. Keep the `Roadmap-Create-…` tag on tasks created by write-back.
- **Manual push access** is configured under **Поля задач → Ручная отправка**. With **Только администраторы** selected, the API restricts preview, push and retry to active administrators. Automatic write-back follows the configured mode.
- **Check readiness** verifies the connection, mode and scope, the work item type and its fields, the current quarter's iteration, people without email, and runs a create request with `validateOnly=true` — Azure DevOps validates permissions, fields and the assignee without saving anything.
- Updates use a revision check (`test /rev`) so Remaining Work is not computed from stale Completed Work. If the task is deleted in Azure DevOps, the next push creates a new one. Demo people are `skipped`.
- The plan page shows a status mark on each assignment (spinner = sending, red = error, grey dot = never sent, hollow dot = skipped), the task link and error in the assignment editor with **Send again**, and **Send to Azure (N)** with the same preview in the plan header.

The PAT needs **Work Items: Read & Write** for write-back.

**Fact ← Azure DevOps.** People log time in Completed Work of their Task. The assignment editor shows these actual hours, and the plan table rolls them up by Feature, Epic, and role. The scheduled import updates them every five minutes. Set up a webhook for faster updates and to process deletions:

1. In Azure DevOps open **Project settings → Service hooks → Create subscription → Web Hooks**.
2. Subscribe to *Work item created*, *updated*, *deleted* and *restored* (one subscription per event).
3. URL: `<API base>/roadmap/webhooks/azure-devops`, for example `https://tracker.example.com/api/v1/roadmap/webhooks/azure-devops`. The API must be reachable from Azure DevOps.
4. HTTP headers: `X-Roadmap-Webhook-Secret:<secret>`. Create, show or rotate the secret in the integration settings; it is stored encrypted like the PAT.

Webhook events are batched per project and re-read from Azure DevOps (the payload is not trusted for field values). Deleted work items without assignments are removed locally; deleted work items with assignments are kept with state `Deleted`. Roadmap's own Task writes also arrive as webhook events and only refresh local data, so there is no write loop.

## Журнал изменений

Roadmap records every change to an assignment together with the change itself: creating or deleting an assignment, and changing its hours, assignee, quarter or monthly split. Each entry shows who changed it, when, and the values before → after. The source is the plan, the AI assistant (the entry names the user who applied the suggestion) or Azure DevOps. Entries that came from Azure DevOps have no author: they are signed **Azure DevOps** and link to the Task, where Azure shows who made the change.

Open the **История** tab of a Feature or Epic card to see the entries for that work item, or click **Журнал изменений** on the plan page for the whole project. The project feed can be filtered by person and period; entries from one action (for example a rebalance) are grouped. The same data is available at `GET /roadmap/projects/:projectId/changes` for anyone with read access to the project.

The log does not record sync statuses, time logging, role hours entered on a Feature that has no assignments for that role, or changes to roles, role members and settings. Saving without a change and an import that changes nothing leave no entries. There is no undo yet.

## Local demo data

For local testing without an Azure DevOps connection, run `npm run db:seed:roadmap-mocks --workspace @tracker/api` to add five demo people and four demo roles to the `OKR` project when available (otherwise the most recently synced project). Pass a project name after `--` to choose a different target, for example `npm run db:seed:roadmap-mocks --workspace @tracker/api -- CRM 2.0`. Demo rows are marked in the UI and are excluded from Azure sync deactivation.
