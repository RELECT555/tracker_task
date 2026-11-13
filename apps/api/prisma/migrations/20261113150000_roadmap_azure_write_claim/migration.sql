ALTER TABLE "roadmap_allocations"
    ADD COLUMN "azure_sync_claim_id" UUID,
    ADD COLUMN "azure_sync_claimed_at" TIMESTAMPTZ,
    ADD COLUMN "azure_sync_requested" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "azure_create_attempt_id" UUID,
    ADD COLUMN "azure_create_organization" VARCHAR(255);

CREATE INDEX "roadmap_allocations_azure_sync_claimed_at_idx"
    ON "roadmap_allocations"("azure_sync_claimed_at");
