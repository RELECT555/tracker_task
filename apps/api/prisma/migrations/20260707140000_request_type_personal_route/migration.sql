-- AlterTable
ALTER TABLE "request_types"
ADD COLUMN "allows_personal_route" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "max_personal_route_steps" INTEGER NOT NULL DEFAULT 5;
