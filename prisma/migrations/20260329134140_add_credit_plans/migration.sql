-- AlterTable
ALTER TABLE "users" ADD COLUMN     "credit_plan_id" TEXT;

-- CreateTable
CREATE TABLE "credit_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate_per_message" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "min_credits" INTEGER NOT NULL DEFAULT 10000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_plans_name_key" ON "credit_plans"("name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_credit_plan_id_fkey" FOREIGN KEY ("credit_plan_id") REFERENCES "credit_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
