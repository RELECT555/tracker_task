ALTER TABLE "roadmap_role_members"
ADD COLUMN "allocation_percent" DECIMAL(5,2) NOT NULL DEFAULT 100;

-- A legacy default employee also belongs in the unified list of role members.
INSERT INTO "roadmap_role_members" ("id", "role_id", "person_id", "created_at")
SELECT gen_random_uuid(), role."id", person."id", CURRENT_TIMESTAMP
FROM "roadmap_roles" role
JOIN "roadmap_people" person ON person."external_id" = role."default_person_external_id"
ON CONFLICT ("role_id", "person_id") DO NOTHING;

-- Divide integer hundredths and distribute the remainder deterministically.
WITH shares AS (
  SELECT "id", COUNT(*) OVER (PARTITION BY "role_id") AS member_count,
    ROW_NUMBER() OVER (PARTITION BY "role_id" ORDER BY "created_at", "id") AS member_number
  FROM "roadmap_role_members"
)
UPDATE "roadmap_role_members" member
SET "allocation_percent" = (
  10000 / shares.member_count
  + CASE WHEN shares.member_number <= 10000 % shares.member_count THEN 1 ELSE 0 END
) / 100.0
FROM shares WHERE shares."id" = member."id";

ALTER TABLE "roadmap_role_members"
ADD CONSTRAINT "roadmap_role_members_allocation_percent_check"
CHECK ("allocation_percent" >= 0 AND "allocation_percent" <= 100);
