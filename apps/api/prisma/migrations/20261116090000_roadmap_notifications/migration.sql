-- AlterTable
ALTER TABLE "roadmap_azure_project_state" ADD COLUMN     "import_failing_since" TIMESTAMPTZ,
ADD COLUMN     "last_import_changed_at" TIMESTAMPTZ,
ADD COLUMN     "last_import_error" VARCHAR(500),
ADD COLUMN     "last_import_failed_at" TIMESTAMPTZ,
ADD COLUMN     "last_import_ok_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "roadmap_alerts" (
    "id" UUID NOT NULL,
    "key" VARCHAR(150) NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "project_id" UUID,
    "state" VARCHAR(20) NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "resolution" VARCHAR(20),
    "clear_since" TIMESTAMPTZ,
    "details" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roadmap_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "project_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000),
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmap_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_alerts_key_key" ON "roadmap_alerts"("key");

-- CreateIndex
CREATE INDEX "roadmap_notifications_user_id_read_at_created_at_idx" ON "roadmap_notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_notifications_alert_id_generation_user_id_key" ON "roadmap_notifications"("alert_id", "generation", "user_id");

-- AddForeignKey
ALTER TABLE "roadmap_alerts" ADD CONSTRAINT "roadmap_alerts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "roadmap_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_notifications" ADD CONSTRAINT "roadmap_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_notifications" ADD CONSTRAINT "roadmap_notifications_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "roadmap_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

