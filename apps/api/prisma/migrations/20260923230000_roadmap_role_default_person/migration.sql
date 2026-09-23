ALTER TABLE "roadmap_roles"
ADD COLUMN "default_person_external_id" VARCHAR(255);

ALTER TABLE "roadmap_roles"
ADD CONSTRAINT "roadmap_roles_default_person_external_id_fkey"
FOREIGN KEY ("default_person_external_id")
REFERENCES "roadmap_people" ("external_id")
ON DELETE SET NULL ON UPDATE CASCADE;