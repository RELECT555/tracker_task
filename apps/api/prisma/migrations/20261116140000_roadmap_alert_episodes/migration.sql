-- CreateTable
CREATE TABLE "roadmap_alert_episodes" (
    "id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "project_id" UUID,
    "opened_at" TIMESTAMPTZ NOT NULL,
    "resolved_at" TIMESTAMPTZ,
    "resolution" VARCHAR(20),
    "details" JSONB NOT NULL,
    "peak_count" INTEGER,
    "opened_count" INTEGER,

    CONSTRAINT "roadmap_alert_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roadmap_alert_episodes_project_id_opened_at_idx" ON "roadmap_alert_episodes"("project_id", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "roadmap_alert_episodes_resolved_at_idx" ON "roadmap_alert_episodes"("resolved_at");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_alert_episodes_alert_id_generation_key" ON "roadmap_alert_episodes"("alert_id", "generation");

-- AddForeignKey
ALTER TABLE "roadmap_alert_episodes" ADD CONSTRAINT "roadmap_alert_episodes_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "roadmap_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_alert_episodes" ADD CONSTRAINT "roadmap_alert_episodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "roadmap_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

