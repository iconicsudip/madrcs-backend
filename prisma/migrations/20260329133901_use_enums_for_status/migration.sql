/*
  Warnings:

  - The `status` column on the `invoices` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `subscription_status` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PAID', 'UNPAID', 'OVERDUE', 'VOID');

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "status",
ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "subscription_status",
ADD COLUMN     "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';
