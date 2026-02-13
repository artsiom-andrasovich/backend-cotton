/*
  Warnings:

  - Made the column `surname` on table `profile` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "profile" ALTER COLUMN "name" SET DEFAULT '',
ALTER COLUMN "surname" SET NOT NULL;
