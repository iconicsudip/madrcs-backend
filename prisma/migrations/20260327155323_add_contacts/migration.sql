-- CreateTable
CREATE TABLE "contact_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ContactToGroup" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContactToGroup_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "contact_groups_name_user_id_key" ON "contact_groups"("name", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_phone_number_user_id_key" ON "contacts"("phone_number", "user_id");

-- CreateIndex
CREATE INDEX "_ContactToGroup_B_index" ON "_ContactToGroup"("B");

-- AddForeignKey
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToGroup" ADD CONSTRAINT "_ContactToGroup_A_fkey" FOREIGN KEY ("A") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToGroup" ADD CONSTRAINT "_ContactToGroup_B_fkey" FOREIGN KEY ("B") REFERENCES "contact_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
