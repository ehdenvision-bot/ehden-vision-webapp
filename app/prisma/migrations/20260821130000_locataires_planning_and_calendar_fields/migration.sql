-- DropIndex
DROP INDEX "CalendarException_projectId_date_key";

-- AlterTable
ALTER TABLE "CalendarException" DROP COLUMN "type",
ADD COLUMN     "isFixed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommonArea" ADD COLUMN     "notePrivate" TEXT,
ADD COLUMN     "notePublic" TEXT,
ADD COLUMN     "planningStatus" TEXT;

-- AlterTable
ALTER TABLE "Facade" ADD COLUMN     "notePrivate" TEXT,
ADD COLUMN     "notePublic" TEXT,
ADD COLUMN     "planningStatus" TEXT;

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "phone",
ADD COLUMN     "email2" TEXT,
ADD COLUMN     "phoneFixed" TEXT,
ADD COLUMN     "phoneMobile1" TEXT,
ADD COLUMN     "phoneMobile2" TEXT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "notePrivate" TEXT,
ADD COLUMN     "notePublic" TEXT,
ADD COLUMN     "planningStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CalendarException_projectId_date_description_key" ON "CalendarException"("projectId", "date", "description");

