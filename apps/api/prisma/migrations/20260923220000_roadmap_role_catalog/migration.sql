INSERT INTO "roadmap_roles" ("id", "project_id", "name", "color", "is_mock", "created_at")
SELECT gen_random_uuid(), NULL, role."name", role."color", role."is_mock", NOW()
FROM (
  SELECT DISTINCT ON ("name") "name", "color", "is_mock"
  FROM "roadmap_roles"
  WHERE "project_id" IS NOT NULL
  ORDER BY "name", "created_at" DESC
) AS role
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "roadmap_roles_catalog_name_key"
ON "roadmap_roles" ("name")
WHERE "project_id" IS NULL;
