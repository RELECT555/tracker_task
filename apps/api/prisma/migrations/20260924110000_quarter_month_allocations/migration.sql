ALTER TABLE "roadmap_period_allocations"
ADD COLUMN "month_key" VARCHAR(7);

CREATE UNIQUE INDEX "roadmap_period_allocations_allocation_id_month_key_key"
ON "roadmap_period_allocations"("allocation_id", "month_key");
