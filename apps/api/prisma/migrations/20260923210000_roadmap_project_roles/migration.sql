ALTER TABLE "roadmap_roles" ADD COLUMN "project_id" UUID;

UPDATE "roadmap_roles"
SET "project_id" = (
  SELECT "id" FROM "roadmap_projects"
  ORDER BY "synced_at" DESC NULLS LAST, "created_at" DESC
  LIMIT 1
)
WHERE "project_id" IS NULL
  AND EXISTS (SELECT 1 FROM "roadmap_projects");

DROP INDEX "roadmap_roles_name_key";
CREATE UNIQUE INDEX "roadmap_roles_project_id_name_key" ON "roadmap_roles"("project_id", "name");

ALTER TABLE "roadmap_roles" ADD CONSTRAINT "roadmap_roles_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "roadmap_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
