ALTER TABLE "roadmap_roles" ADD COLUMN "azure_estimate_field" VARCHAR(255);

CREATE UNIQUE INDEX "roadmap_roles_project_id_azure_estimate_field_key"
ON "roadmap_roles"("project_id", "azure_estimate_field");
