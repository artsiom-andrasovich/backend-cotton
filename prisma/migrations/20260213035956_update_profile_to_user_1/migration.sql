/*
  Warnings:

  - You are about to drop the column `name` on the `profile` table. All the data in the column will be lost.
  - You are about to drop the column `surname` on the `profile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "profile" DROP COLUMN "name",
DROP COLUMN "surname",
ADD COLUMN     "first_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "last_name" TEXT NOT NULL DEFAULT '';
