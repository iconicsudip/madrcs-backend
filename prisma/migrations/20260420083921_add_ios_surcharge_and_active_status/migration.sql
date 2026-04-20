/*
  Warnings:

  - You are about to drop the column `due_date` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `paid_at` on the `invoices` table. All the data in the column will be lost.
  - The `status` column on the `invoices` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `last_billing_date` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `msg91_api_key` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `subscription_end_date` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `subscription_status` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `usage_records` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updated_at` to the `invoices` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "usage_records" DROP CONSTRAINT "usage_records_user_id_fkey";

-- AlterTable
ALTER TABLE "credit_plans" ADD COLUMN     "ios_rate_extra" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "use_ios_surcharge" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "due_date",
DROP COLUMN "paid_at",
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "last_billing_date",
DROP COLUMN "msg91_api_key",
DROP COLUMN "subscription_end_date",
DROP COLUMN "subscription_status",
ALTER COLUMN "credit_balance" SET DEFAULT 0,
ALTER COLUMN "credit_balance" SET DATA TYPE DOUBLE PRECISION;

-- DropTable
DROP TABLE "usage_records";

-- DropEnum
DROP TYPE "InvoiceStatus";

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- CreateTable
CREATE TABLE "template_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "contact_source" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "total_contacts" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "msg91_request_id" TEXT,
    "namespace" TEXT,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_events" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_details" TEXT,
    "status_updated_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "engagement" TEXT,
    "read_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "user_response" TEXT,
    "country" TEXT,
    "country_code" TEXT,
    "telecom_circle" TEXT,

    CONSTRAINT "campaign_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_user_id_idx" ON "campaigns"("user_id");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_created_at_idx" ON "campaigns"("created_at");

-- CreateIndex
CREATE INDEX "campaign_events_campaign_id_idx" ON "campaign_events"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_events_event_type_idx" ON "campaign_events"("event_type");

-- CreateIndex
CREATE INDEX "campaign_events_created_at_idx" ON "campaign_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_events_campaign_id_phone_number_key" ON "campaign_events"("campaign_id", "phone_number");

-- CreateIndex
CREATE INDEX "activities_user_id_idx" ON "activities"("user_id");

-- CreateIndex
CREATE INDEX "activities_type_idx" ON "activities"("type");

-- CreateIndex
CREATE INDEX "activities_created_at_idx" ON "activities"("created_at");

-- CreateIndex
CREATE INDEX "invoices_user_id_idx" ON "invoices"("user_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- AddForeignKey
ALTER TABLE "template_drafts" ADD CONSTRAINT "template_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
