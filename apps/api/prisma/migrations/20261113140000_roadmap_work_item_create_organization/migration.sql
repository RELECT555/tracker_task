ALTER TABLE "roadmap_work_item_create_requests" ADD COLUMN "azure_organization" VARCHAR(255);

UPDATE "roadmap_work_item_create_requests" AS request
SET "azure_organization" = LOWER(COALESCE(
    (regexp_match(project."url", '^https://dev\.azure\.com/([a-z0-9-]+)/_apis/projects/', 'i'))[1],
    (regexp_match(project."url", '^https://([a-z0-9-]+)\.visualstudio\.com/_apis/projects/', 'i'))[1]
))
FROM "roadmap_projects" AS project
WHERE request."project_id" = project."id";
