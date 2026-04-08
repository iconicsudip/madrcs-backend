-- CreateEnum
CREATE TYPE "CreditRequestStatus" AS ENUM ('PENDING', 'PAID', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "credit_balance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "credit_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "CreditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
