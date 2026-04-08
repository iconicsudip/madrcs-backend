-- AlterTable
ALTER TABLE "users" ADD COLUMN     "recovery_codes" TEXT[] DEFAULT ARRAY[]::TEXT[];
