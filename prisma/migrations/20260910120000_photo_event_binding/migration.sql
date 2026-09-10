-- Additive: existing photo timestamps remain unchanged (UTC in timestamp(3)).
ALTER TABLE "PendingAction" ADD COLUMN "targetShiftId" INTEGER;
ALTER TABLE "TelegramUpdateQueue" ADD COLUMN "actorKey" TEXT;
UPDATE "TelegramUpdateQueue" SET "actorKey" = COALESCE(
  payload #>> '{message,from,id}', payload #>> '{callback_query,from,id}',
  payload #>> '{edited_message,from,id}', 'update:' || "updateId"::text
);
CREATE INDEX "TelegramUpdateQueue_actorKey_status_updateId_idx" ON "TelegramUpdateQueue"("actorKey", "status", "updateId");
-- Bind existing END confirmations to the latest shift starting before their photo.
UPDATE "PendingAction" p SET "targetShiftId" = (
  SELECT s.id FROM "Shift" s WHERE s."employeeId" = p."employeeId"
  AND s."startTime" <= p."createdAt" ORDER BY s."startTime" DESC, s.id DESC LIMIT 1
) WHERE p."actionType" = 'END';
