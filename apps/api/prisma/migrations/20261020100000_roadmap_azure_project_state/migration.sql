CREATE TABLE "roadmap_azure_project_state" (
    "project_id" UUID NOT NULL,
    "last_check_at" TIMESTAMPTZ,
    "last_check_result" JSONB,
    "last_webhook_at" TIMESTAMPTZ,
    "settings_override" JSONB,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmap_azure_project_state_pkey" PRIMARY KEY ("project_id")
);

ALTER TABLE "roadmap_azure_project_state"
ADD CONSTRAINT "roadmap_azure_project_state_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "roadmap_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
