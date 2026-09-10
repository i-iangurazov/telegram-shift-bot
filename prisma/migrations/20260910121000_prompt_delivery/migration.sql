-- Recover interrupted photo prompts without changing the source photo timestamp.
ALTER TABLE "PendingAction" ADD COLUMN "promptMessageId" INTEGER;
