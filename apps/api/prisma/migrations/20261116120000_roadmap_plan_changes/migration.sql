-- CreateTable
CREATE TABLE "roadmap_plan_changes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "actor_user_id" UUID,
    "actor_email" VARCHAR(255),
    "actor_name" VARCHAR(255),
    "azure_task_id" VARCHAR(100),
    "allocation_id" UUID NOT NULL,
    "work_item_id" UUID,
    "work_item_external_id" VARCHAR(100) NOT NULL,
    "work_item_title" VARCHAR(1000) NOT NULL,
    "role_id" UUID NOT NULL,
    "role_name" VARCHAR(100) NOT NULL,
    "quarter_key" VARCHAR(7) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmap_plan_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roadmap_plan_changes_project_id_created_at_idx" ON "roadmap_plan_changes"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "roadmap_plan_changes_work_item_id_created_at_idx" ON "roadmap_plan_changes"("work_item_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "roadmap_plan_changes_allocation_id_created_at_idx" ON "roadmap_plan_changes"("allocation_id", "created_at");

-- CreateIndex
CREATE INDEX "roadmap_plan_changes_batch_id_idx" ON "roadmap_plan_changes"("batch_id");

-- AddForeignKey
ALTER TABLE "roadmap_plan_changes" ADD CONSTRAINT "roadmap_plan_changes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "roadmap_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
