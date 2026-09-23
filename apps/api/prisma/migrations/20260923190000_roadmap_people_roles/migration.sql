CREATE TABLE "roadmap_people" (
    "id" UUID NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "roadmap_people_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roadmap_role_members" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roadmap_role_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roadmap_people_external_id_key" ON "roadmap_people"("external_id");
CREATE INDEX "roadmap_people_is_active_name_idx" ON "roadmap_people"("is_active", "name");
CREATE UNIQUE INDEX "roadmap_role_members_role_id_person_id_key" ON "roadmap_role_members"("role_id", "person_id");
CREATE INDEX "roadmap_role_members_person_id_idx" ON "roadmap_role_members"("person_id");

ALTER TABLE "roadmap_role_members" ADD CONSTRAINT "roadmap_role_members_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "roadmap_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_role_members" ADD CONSTRAINT "roadmap_role_members_person_id_fkey"
FOREIGN KEY ("person_id") REFERENCES "roadmap_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
