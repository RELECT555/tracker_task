# Roadmap workspace

Roadmap is a project planning workspace backed by Azure DevOps. It imports a project's Epics and Features and the organization's people directory. Planning data is stored in Roadmap; when plan write-back is enabled (see [Two-way sync](#two-way-sync-with-azure-devops)), each assignment is also mirrored by an Azure DevOps Task. Roadmap never changes the imported Epics and Features themselves.

## Azure DevOps connection

Roadmap administrators can open `/roadmap/admin`, then choose the **Integrations** card. Enter the organization URL and a PAT with read access to Projects and Teams, Work Items, and Graph, then use **Test connection** and **Save**. The PAT is not returned to the browser and is stored encrypted in the database.

For local development, the API can also read a connection from `apps/api/.env`:

```env
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_PAT=your-personal-access-token
```

Set `ROADMAP_ENCRYPTION_KEY` to a stable server secret for encrypting saved credentials. If it is unset, the API uses `JWT_SECRET` as the encryption key. Changing the key makes previously stored PATs unreadable. Environment variables remain a fallback; credentials saved in Roadmap administration take precedence. Azure DevOps Services REST API 7.1 is used for projects and work items; the organization Graph users endpoint is `7.1-preview.1`.

## Planning model

- The planning table groups imported Features under their Azure DevOps Epics. Epic rows summarize the assignments and hours in their child Features.
- Role types are created once in the shared role catalog. Add only the roles needed by each imported project from the **Add role** control in the planning table header; each project keeps its own participant assignments for those roles.
- Choose a default person for a project role in its table heading. This person appears on work items until a work item has its own assignment; work item changes stay local to that Feature or Epic.
- Feature cells offer only active people assigned to that project's role. Synchronize the people directory from the **Users** card after connecting Azure DevOps.
- User synchronization ignores deleted identities, profiles without an email/principal name, and known Azure DevOps service identities; excluded accounts are deactivated and hidden unless an administrator chooses to show inactive users.
- Planning is quarterly. Every person assignment belongs to one quarter (`YYYY-Qn`), and its estimate is the hours planned for that quarter. The role view has a quarter switcher and shows only the selected quarter's assignments; work that spans several quarters gets a separate assignment per quarter. Assignments created before quarterly planning were moved to 2026-Q4.
- Period (monthly) planning is currently disabled in the UI (`PERIOD_PLANNING_ENABLED` in `RoadmapPage.tsx`); only the role view is available. Existing monthly values are kept and still count toward the estimate check.
- The period view selects a quarter and shows its three months as shared project-wide buckets. Quarter navigation only filters the plan; it does not delete values in other months.
- Monthly values are non-negative half-hour increments. Their sum, including preserved legacy period estimates, cannot exceed the assignment's overall estimate. The remaining estimate is shown separately.
- Older custom date ranges are preserved and shown separately; the system does not automatically split their hours between months.

Use **Synchronize** on an imported project to refresh work item names, types, states, parent links, the standard `Completed Work` value, and custom role/estimate fields. Roadmap shows role estimate fields on each work item. Its planned hours come from Roadmap allocations; actual hours on Features and Epics include their own `Completed Work` plus actual hours from descendant Tasks, following intermediate parent work items. Existing planning assignments remain attached to the matching Azure DevOps work item IDs.

## Two-way sync with Azure DevOps

The plan is owned by Roadmap; the actuals are owned by Azure DevOps. Everything is configured in **Integrations**, which has five tabs:

- **Connection** — organization URL, PAT and the PAT scopes needed for each feature.
- **How it works** — the data flow, which system owns each field, do/don't rules, the status legend and the first-run order.
- **Write settings** — mode, project scope, work item type, title/tag templates, fields to write and the Remaining Work policy.
- **Projects and status** — per-project counters, **Check readiness**, **Load from Azure** (re-import + fact) and **Send to Azure** with a preview; recent errors with **Send again**.
- **Webhook** — secret and step-by-step service hook setup.

**Plan → Azure DevOps (write-back).** Every assignment (work item × role × person × quarter) is mirrored by a work item (Task by default) under its Feature or Epic.

- **Mode**: *Off* (nothing is written; edits are remembered as `pending`), *Manual* (edits queue up and are sent with **Send to Azure** after a preview — recommended to start), *Automatic* (each saved assignment is sent right away; queued ones within a minute, also after an API restart). Settings saved by the first version (`writeBackEnabled: true`) are read as *Automatic*.
- **Projects**: all imported projects or only selected ones; assignments of other projects are `skipped`.
- **Templates**: title and tags accept `{role}`, `{title}`, `{quarter}` (Q4 2026), `{quarterKey}` (2026-Q4), `{person}`, `{id}`. Defaults: `{role}: {title} ({quarter})` and `Roadmap; Roadmap {quarterKey}; {role}`.
- **Fields** (each can be turned off): Assigned To (person's email/principal name), Original Estimate, Remaining Work, Iteration Path, Area Path (copied from the parent), Description. Fields missing from the project's process (for example Original Estimate in Scrum) are skipped.
- **Remaining Work policy**: *recalculate* (estimate − Completed Work on every estimate change) or *on create only*.
- Iteration Path is the iteration whose path names the quarter (`2026 Q4`, `Q4-2026`, …), otherwise the narrowest iteration whose dates span the quarter, otherwise the project default.
- **Preview** lists what will be created, updated (with the old → new estimate) or skipped and why; you can untick assignments before sending.
- **Check readiness** verifies the connection, mode and scope, the work item type and its fields, the current quarter's iteration, people without email, and runs a create request with `validateOnly=true` — Azure DevOps validates permissions, fields and the assignee without saving anything.
- Updates use a revision check (`test /rev`) so Remaining Work is not computed from stale Completed Work. If the task is deleted in Azure DevOps, the next push creates a new one. Demo people are `skipped`.
- The plan page shows a status mark on each assignment (spinner = sending, red = error, grey dot = never sent, hollow dot = skipped), the task link and error in the assignment editor with **Send again**, and **Send to Azure (N)** with the same preview in the plan header.

The PAT needs **Work Items: Read & Write** for write-back.

**Fact ← Azure DevOps.** People log time in Completed Work of their Task. It becomes the assignment's fact (shown as `fact / plan` on the assignment) and rolls up into the Feature and Epic fact. Without a webhook this refreshes on **Synchronize** (plan page) or **Load from Azure** (Integrations → Projects and status); with a webhook it refreshes a couple of seconds after the change:

1. In Azure DevOps open **Project settings → Service hooks → Create subscription → Web Hooks**.
2. Subscribe to *Work item created*, *updated*, *deleted* and *restored* (one subscription per event).
3. URL: `<API base>/roadmap/webhooks/azure-devops`, for example `https://tracker.example.com/api/v1/roadmap/webhooks/azure-devops`. The API must be reachable from Azure DevOps.
4. HTTP headers: `X-Roadmap-Webhook-Secret:<secret>`. Create, show or rotate the secret in the integration settings; it is stored encrypted like the PAT.

Webhook events are batched per project and re-read from Azure DevOps (the payload is not trusted for field values). Deleted work items without assignments are removed locally; deleted work items with assignments are kept with state `Deleted`. Roadmap's own Task writes also arrive as webhook events and only refresh local data, so there is no write loop.

## Local demo data

For local testing without an Azure DevOps connection, run `npm run db:seed:roadmap-mocks --workspace @tracker/api` to add five demo people and four demo roles to the `OKR` project when available (otherwise the most recently synced project). Pass a project name after `--` to choose a different target, for example `npm run db:seed:roadmap-mocks --workspace @tracker/api -- CRM 2.0`. Demo rows are marked in the UI and are excluded from Azure sync deactivation.
