-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "notification_pref" JSONB DEFAULT '{"campaign_alerts": true, "low_credit": true, "weekly_reports": false}',
ADD COLUMN     "two_fact_enabled" BOOLEAN NOT NULL DEFAULT false;
