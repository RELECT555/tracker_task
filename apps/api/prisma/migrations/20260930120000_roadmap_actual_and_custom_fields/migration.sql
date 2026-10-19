ALTER TABLE "roadmap_work_items"
ADD COLUMN "actual_hours" DECIMAL(10,2),
ADD COLUMN "azure_custom_fields" JSONB;
