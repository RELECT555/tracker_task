# Roadmap workspace

Roadmap is a project planning workspace backed by Azure DevOps. It imports a project's Epics and Features and the organization's people directory. Local planning data is stored separately from Azure DevOps so estimates and role assignments do not modify work items upstream.

## Azure DevOps connection

Roadmap administrators can connect Azure DevOps at `/roadmap/admin/integrations`. Enter the organization URL and a PAT with read access to Projects and Teams, Work Items, and Graph, then use **Test connection** and **Save**. The PAT is not returned to the browser and is stored encrypted in the database.

For local development, the API can also read a connection from `apps/api/.env`:

```env
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_PAT=your-personal-access-token
```

Set `ROADMAP_ENCRYPTION_KEY` to a stable server secret for encrypting saved credentials. If it is unset, the API uses `JWT_SECRET` as the encryption key. Changing the key makes previously stored PATs unreadable. Environment variables remain a fallback; credentials saved in Roadmap administration take precedence. Azure DevOps Services REST API 7.1 is used for projects and work items; the organization Graph users endpoint is `7.1-preview.1`.

## Planning model

- Rows are imported Epics and Features, grouped by their Azure DevOps parent work item.
- Columns are Roadmap roles, which are created in the workspace.
- A role cell can have multiple people from the Azure DevOps organization.
- Every person assignment has an overall hour estimate and can have one or more dated period estimates.
- The overall estimate and period estimates are shown separately; editing period values does not change the overall estimate.

Use **Synchronize** on an imported project to refresh work item names, types, states, and parent links. Existing planning assignments remain attached to the matching Azure DevOps work item IDs.
