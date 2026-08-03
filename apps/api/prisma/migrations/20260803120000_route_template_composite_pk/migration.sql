-- Route templates are versioned: every version is its own row sharing the same id.
-- The single-column primary key made a second version violate route_templates_pkey,
-- so creating a new version failed. Move the primary key to (id, version).

ALTER TABLE "route_step_templates"
    DROP CONSTRAINT "route_step_templates_route_template_id_route_template_vers_fkey";

DROP INDEX "route_templates_id_version_key";

ALTER TABLE "route_templates" DROP CONSTRAINT "route_templates_pkey";

ALTER TABLE "route_templates" ADD CONSTRAINT "route_templates_pkey" PRIMARY KEY ("id", "version");

ALTER TABLE "route_step_templates"
    ADD CONSTRAINT "route_step_templates_route_template_id_route_template_vers_fkey"
    FOREIGN KEY ("route_template_id", "route_template_version")
    REFERENCES "route_templates"("id", "version") ON DELETE CASCADE ON UPDATE CASCADE;
