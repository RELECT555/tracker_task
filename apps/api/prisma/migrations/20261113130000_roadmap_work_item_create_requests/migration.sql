CREATE TABLE "roadmap_work_item_create_requests" (
    "request_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "azure_id" VARCHAR(100),
    "azure_title" VARCHAR(255),
    "azure_state" VARCHAR(100),
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "roadmap_work_item_create_requests_pkey" PRIMARY KEY ("request_id"),
    CONSTRAINT "roadmap_work_item_create_requests_project_id_fkey"
        FOREIGN KEY ("project_id") REFERENCES "roadmap_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "roadmap_work_item_create_requests_project_id_type_status_idx"
ON "roadmap_work_item_create_requests"("project_id", "type", "status");
