-- Migration: add sentence_id to recording_submissions
-- Run this on the Oracle server: mysql -u root -p learning_app < this_file.sql

ALTER TABLE `recording_submissions`
  ADD COLUMN `sentence_id` VARCHAR(191) NULL AFTER `lesson_id`,
  ADD CONSTRAINT `recording_submissions_sentence_id_fkey`
    FOREIGN KEY (`sentence_id`) REFERENCES `sentences`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
