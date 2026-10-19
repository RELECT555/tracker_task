-- Each allocation can be mirrored by an Azure DevOps Task that Roadmap creates and keeps in sync.
ALTER TABLE "roadmap_allocations"
ADD COLUMN "azure_task_id" VARCHAR(100),
ADD COLUMN "azure_sync_status" VARCHAR(20),
ADD COLUMN "azure_sync_error" VARCHAR(1000),
ADD COLUMN "azure_synced_at" TIMESTAMPTZ,
ADD COLUMN "azure_pushed_hours" DECIMAL(10, 2);

CREATE INDEX "roadmap_allocations_azure_sync_status_idx" ON "roadmap_allocations"("azure_sync_status");
CREATE INDEX "roadmap_allocations_azure_task_id_idx" ON "roadmap_allocations"("azure_task_id");
