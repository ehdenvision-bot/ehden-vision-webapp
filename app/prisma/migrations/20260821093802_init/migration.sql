-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "isClientRole" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "legacyPasswordHash" TEXT,
    "roleId" TEXT,
    "team" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Actif',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "city" TEXT,
    "country" TEXT,
    "progressPct" DECIMAL(5,2),
    "units" INTEGER,
    "description" TEXT,
    "logoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProjectAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "UserProjectAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "hall" TEXT,
    "floor" TEXT,
    "stackNumber" TEXT,
    "doorNumber" TEXT,
    "type" TEXT,
    "unitTypeConfig" TEXT,
    "surfaceM2" DECIMAL(8,2),

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "lastName" TEXT,
    "firstName" TEXT,
    "street" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "moveInDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitTypeRoomConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UnitTypeRoomConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommonArea" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "hall" TEXT,
    "floor" TEXT,
    "description" TEXT,
    "typeRef" TEXT,
    "abbreviation" TEXT,

    CONSTRAINT "CommonArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommonAreaType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,

    CONSTRAINT "CommonAreaType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facade" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "orientation" TEXT,
    "trame" TEXT,
    "part" TEXT,
    "type" TEXT,

    CONSTRAINT "Facade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacadeType" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "FacadeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskType" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "activityType" TEXT,
    "teamId" TEXT,
    "description" TEXT,
    "shortDescription" TEXT,
    "color" TEXT,
    "defaultDuration" DECIMAL(6,2),
    "durationType" TEXT,

    CONSTRAINT "TaskType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCycle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sequence" JSONB NOT NULL,

    CONSTRAINT "TaskCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarException" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL,
    "unitId" TEXT,
    "commonAreaId" TEXT,
    "facadeId" TEXT,
    "taskTypeId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "slot" TEXT,
    "status" TEXT,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskProgress" (
    "id" TEXT NOT NULL,
    "unitId" TEXT,
    "commonAreaId" TEXT,
    "facadeId" TEXT,
    "taskTypeId" TEXT NOT NULL,
    "targetDate" DATE,
    "completionDate" DATE,
    "notePublic" TEXT,
    "notePrivate" TEXT,
    "status" TEXT,

    CONSTRAINT "TaskProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserve" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "unitId" TEXT,
    "commonAreaId" TEXT,
    "facadeId" TEXT,
    "disciplineId" TEXT,
    "description" TEXT,
    "coordX" DECIMAL(8,4),
    "coordY" DECIMAL(8,4),
    "status" TEXT NOT NULL DEFAULT 'open',
    "teamId" TEXT,
    "teamContactId" TEXT,
    "interventionDate" DATE,
    "interventionSlot" TEXT,
    "dueDate" DATE,
    "history" JSONB,
    "needsValidation" BOOLEAN NOT NULL DEFAULT false,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EdlNote" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "notePublic" TEXT,
    "notePrivate" TEXT,

    CONSTRAINT "EdlNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EdlPhoto" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "room" TEXT,
    "filePath" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EdlPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkFieldDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "targetEntityType" TEXT NOT NULL,
    "subCategory" TEXT,
    "discipline" TEXT,
    "workType" TEXT,
    "applicableRooms" JSONB,
    "fieldType" TEXT NOT NULL,
    "fieldDetails" TEXT,
    "options" JSONB,

    CONSTRAINT "WorkFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkFieldValue" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" JSONB,

    CONSTRAINT "WorkFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "entityKind" TEXT NOT NULL,
    "entityId" TEXT,
    "visibility" TEXT,
    "type" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT,
    "errorMessage" TEXT NOT NULL,
    "stackTrace" TEXT,
    "context" TEXT,
    "payload" JSONB,
    "treated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionAuditLog" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT,
    "role" TEXT,
    "status" TEXT,
    "itemName" TEXT,
    "action" TEXT,
    "rightTargeted" TEXT,
    "rightBefore" TEXT,
    "result" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "baseFilename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,

    CONSTRAINT "PlanAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_category_key_key" ON "AppSetting"("category", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserProjectAccess_userId_projectId_key" ON "UserProjectAccess"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Building_projectId_code_key" ON "Building"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_identifiant_key" ON "Unit"("identifiant");

-- CreateIndex
CREATE UNIQUE INDEX "UnitTypeRoomConfig_code_key" ON "UnitTypeRoomConfig"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitTypeRoomConfig_code_room_key" ON "UnitTypeRoomConfig"("code", "room");

-- CreateIndex
CREATE UNIQUE INDEX "CommonArea_identifiant_key" ON "CommonArea"("identifiant");

-- CreateIndex
CREATE UNIQUE INDEX "CommonAreaType_name_key" ON "CommonAreaType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Facade_identifiant_key" ON "Facade"("identifiant");

-- CreateIndex
CREATE UNIQUE INDEX "FacadeType_type_key" ON "FacadeType"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Discipline_projectId_name_key" ON "Discipline"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_projectId_name_key" ON "Team"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TaskType_projectId_abbreviation_key" ON "TaskType"("projectId", "abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCycle_projectId_name_key" ON "TaskCycle"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarException_projectId_date_key" ON "CalendarException"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TaskProgress_unitId_commonAreaId_facadeId_taskTypeId_key" ON "TaskProgress"("unitId", "commonAreaId", "facadeId", "taskTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Reserve_code_key" ON "Reserve"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EdlNote_unitId_room_key" ON "EdlNote"("unitId", "room");

-- CreateIndex
CREATE UNIQUE INDEX "WorkFieldDefinition_code_key" ON "WorkFieldDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkFieldValue_unitId_fieldId_key" ON "WorkFieldValue"("unitId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanAsset_baseFilename_key" ON "PlanAsset"("baseFilename");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectAccess" ADD CONSTRAINT "UserProjectAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectAccess" ADD CONSTRAINT "UserProjectAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommonArea" ADD CONSTRAINT "CommonArea_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facade" ADD CONSTRAINT "Facade_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discipline" ADD CONSTRAINT "Discipline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskType" ADD CONSTRAINT "TaskType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskType" ADD CONSTRAINT "TaskType_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCycle" ADD CONSTRAINT "TaskCycle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarException" ADD CONSTRAINT "CalendarException_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_commonAreaId_fkey" FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_facadeId_fkey" FOREIGN KEY ("facadeId") REFERENCES "Facade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_commonAreaId_fkey" FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_facadeId_fkey" FOREIGN KEY ("facadeId") REFERENCES "Facade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserve" ADD CONSTRAINT "Reserve_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserve" ADD CONSTRAINT "Reserve_commonAreaId_fkey" FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserve" ADD CONSTRAINT "Reserve_facadeId_fkey" FOREIGN KEY ("facadeId") REFERENCES "Facade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserve" ADD CONSTRAINT "Reserve_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserve" ADD CONSTRAINT "Reserve_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserve" ADD CONSTRAINT "Reserve_teamContactId_fkey" FOREIGN KEY ("teamContactId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdlNote" ADD CONSTRAINT "EdlNote_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdlPhoto" ADD CONSTRAINT "EdlPhoto_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkFieldValue" ADD CONSTRAINT "WorkFieldValue_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkFieldValue" ADD CONSTRAINT "WorkFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "WorkFieldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAsset" ADD CONSTRAINT "PlanAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
