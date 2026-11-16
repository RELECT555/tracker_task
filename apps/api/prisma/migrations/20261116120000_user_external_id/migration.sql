-- Microsoft Entra ID object id (oid) of the linked account.
ALTER TABLE "users" ADD COLUMN "external_id" VARCHAR(64);

CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");
