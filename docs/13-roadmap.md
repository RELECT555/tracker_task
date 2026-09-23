# Roadmap workspace

Roadmap is a project planning workspace backed by Azure DevOps. It imports a project's Epics and Features and the organization's people directory. Local planning data is stored separately from Azure DevOps so estimates and role assignments do not modify work items upstream.

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
- Every person assignment has an overall hour estimate and can have one or more dated period estimates.
- The overall estimate and period estimates are shown separately; editing period values does not change the overall estimate.

Use **Synchronize** on an imported project to refresh work item names, types, states, and parent links. Existing planning assignments remain attached to the matching Azure DevOps work item IDs.

## Local demo data

For local testing without an Azure DevOps connection, run `npm run db:seed:roadmap-mocks --workspace @tracker/api` to add five demo people and four demo roles to the `OKR` project when available (otherwise the most recently synced project). Pass a project name after `--` to choose a different target, for example `npm run db:seed:roadmap-mocks --workspace @tracker/api -- CRM 2.0`. Demo rows are marked in the UI and are excluded from Azure sync deactivation.
