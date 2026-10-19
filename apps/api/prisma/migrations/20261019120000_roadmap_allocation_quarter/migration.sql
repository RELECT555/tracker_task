-- Allocations are planned per quarter; existing allocations are assigned to 2026-Q4.
ALTER TABLE "roadmap_allocations"
ADD COLUMN "quarter_key" VARCHAR(7) NOT NULL DEFAULT '2026-Q4';

ALTER TABLE "roadmap_allocations"
ALTER COLUMN "quarter_key" DROP DEFAULT;

DROP INDEX "roadmap_allocations_work_item_id_role_id_person_external_id_key";

CREATE UNIQUE INDEX "roadmap_allocations_person_quarter_key"
ON "roadmap_allocations"("work_item_id", "role_id", "person_external_id", "quarter_key");
