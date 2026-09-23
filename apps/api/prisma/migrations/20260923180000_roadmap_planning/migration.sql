CREATE TABLE "roadmap_projects" (
    "id" UUID NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "url" VARCHAR(1000),
    "synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "roadmap_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roadmap_work_items" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "parent_external_id" VARCHAR(100),
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(1000) NOT NULL,
    "state" VARCHAR(100),
    "url" VARCHAR(1000),
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "roadmap_work_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roadmap_roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20) NOT NULL DEFAULT '#6366f1',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roadmap_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roadmap_allocations" (
    "id" UUID NOT NULL,
    "work_item_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "person_external_id" VARCHAR(255) NOT NULL,
    "person_name" VARCHAR(255) NOT NULL,
    "person_email" VARCHAR(255),
    "estimated_hours" DECIMAL(10,2) NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "roadmap_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roadmap_period_allocations" (
    "id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "roadmap_period_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roadmap_projects_external_id_key" ON "roadmap_projects"("external_id");
CREATE UNIQUE INDEX "roadmap_work_items_project_id_external_id_key" ON "roadmap_work_items"("project_id", "external_id");
CREATE INDEX "roadmap_work_items_project_id_type_idx" ON "roadmap_work_items"("project_id", "type");
CREATE INDEX "roadmap_work_items_project_id_parent_external_id_idx" ON "roadmap_work_items"("project_id", "parent_external_id");
CREATE UNIQUE INDEX "roadmap_roles_name_key" ON "roadmap_roles"("name");
CREATE UNIQUE INDEX "roadmap_allocations_work_item_id_role_id_person_external_id_key" ON "roadmap_allocations"("work_item_id", "role_id", "person_external_id");
CREATE INDEX "roadmap_allocations_work_item_id_idx" ON "roadmap_allocations"("work_item_id");
CREATE INDEX "roadmap_period_allocations_allocation_id_starts_at_idx" ON "roadmap_period_allocations"("allocation_id", "starts_at");

ALTER TABLE "roadmap_work_items" ADD CONSTRAINT "roadmap_work_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "roadmap_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_allocations" ADD CONSTRAINT "roadmap_allocations_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "roadmap_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_allocations" ADD CONSTRAINT "roadmap_allocations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roadmap_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_period_allocations" ADD CONSTRAINT "roadmap_period_allocations_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "roadmap_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
