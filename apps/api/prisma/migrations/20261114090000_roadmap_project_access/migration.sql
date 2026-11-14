BEGIN;

CREATE TYPE "RoadmapProjectRole" AS ENUM ('viewer', 'planner');

CREATE TABLE "roadmap_project_access" (
    "project_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "RoadmapProjectRole" NOT NULL,
    CONSTRAINT "roadmap_project_access_pkey" PRIMARY KEY ("project_id", "email"),
    CONSTRAINT "roadmap_project_access_project_id_fkey" FOREIGN KEY ("project_id")
        REFERENCES "roadmap_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "roadmap_project_access_email_idx" ON "roadmap_project_access"("email");

INSERT INTO "org_units" ("id", "name", "path")
VALUES ('00000000-0000-4000-8000-000000000001', 'Roadmap', '/roadmap')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "users" ("id", "email", "full_name", "org_unit_id", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000002', 'admin@tracker.local', 'Администратор Roadmap',
        '00000000-0000-4000-8000-000000000001', NOW())
ON CONFLICT ("email") DO UPDATE SET
    "full_name" = EXCLUDED."full_name", "manager_id" = NULL,
    "is_active" = TRUE, "password_hash" = NULL, "updated_at" = NOW();

INSERT INTO "roles" ("id", "code", "name")
VALUES (gen_random_uuid(), 'admin', 'Администратор')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "user_roles" ("user_id", "role_id")
SELECT u."id", r."id" FROM "users" u CROSS JOIN "roles" r
WHERE u."email" = 'admin@tracker.local' AND r."code" = 'admin'
ON CONFLICT DO NOTHING;

UPDATE "users" u SET "is_active" = FALSE, "password_hash" = NULL, "updated_at" = NOW()
FROM (VALUES
    ('00000000-0000-4000-8000-000000000003'::UUID, 'manager@tracker.local'),
    ('00000000-0000-4000-8000-000000000004'::UUID, 'director@tracker.local'),
    ('00000000-0000-4000-8000-000000000005'::UUID, 'employee@tracker.local'),
    ('00000000-0000-4000-8000-000000000006'::UUID, 'employee2@tracker.local'),
    ('00000000-0000-4000-8000-000000000007'::UUID, 'observer@tracker.local')
) AS seed(id, email) WHERE u."id" = seed.id AND u."email" = seed.email;

COMMIT;
