CREATE DATABASE  IF NOT EXISTS `atlascopco_drawing_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `atlascopco_drawing_db`;
-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: localhost    Database: atlascopco_drawing_db
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `drawing_files`
--

DROP TABLE IF EXISTS `drawing_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `drawing_files` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `drawing_id` bigint NOT NULL,
  `revision_id` bigint DEFAULT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `uploaded_by` bigint NOT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `file_data` longblob,
  PRIMARY KEY (`id`),
  KEY `fk_files_user` (`uploaded_by`),
  KEY `idx_files_drawing` (`drawing_id`),
  KEY `idx_files_revision` (`revision_id`),
  CONSTRAINT `fk_files_drawing` FOREIGN KEY (`drawing_id`) REFERENCES `drawings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_files_revision` FOREIGN KEY (`revision_id`) REFERENCES `drawing_revisions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_files_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `drawing_revisions`
--

DROP TABLE IF EXISTS `drawing_revisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `drawing_revisions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `drawing_id` bigint NOT NULL,
  `revision_no` int NOT NULL,
  `reviewer_id` bigint DEFAULT NULL,
  `review_comments` text,
  `reviewed_date` datetime DEFAULT NULL,
  `approved` tinyint(1) DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `task_number` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_revision_per_drawing` (`drawing_id`,`revision_no`),
  KEY `idx_revision_drawing` (`drawing_id`),
  KEY `idx_revision_reviewer` (`reviewer_id`),
  CONSTRAINT `fk_revision_drawing` FOREIGN KEY (`drawing_id`) REFERENCES `drawings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_revision_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `drawings`
--

DROP TABLE IF EXISTS `drawings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `drawings` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `drawing_no` varchar(100) NOT NULL,
  `creator_id` bigint NOT NULL,
  `task_number` varchar(100) DEFAULT NULL,
  `drawing_type` varchar(255) DEFAULT NULL,
  `submission_comments` text,
  `status` enum('submitted','under_review','approved','rejected') NOT NULL DEFAULT 'submitted',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `drawing_no` (`drawing_no`),
  KEY `idx_drawings_creator` (`creator_id`),
  CONSTRAINT `fk_drawings_creator` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `error_codes`
--

DROP TABLE IF EXISTS `error_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `error_codes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `description` text,
  `category` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `login_otp`
--

DROP TABLE IF EXISTS `login_otp`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_otp` (
  `user_id` bigint NOT NULL,
  `purpose` enum('first_login','password_reset') NOT NULL,
  `otp` varchar(100) NOT NULL,
  `expires_at` datetime NOT NULL,
  `consumed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`user_id`,`purpose`),
  CONSTRAINT `fk_otp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `revision_error_codes`
--

DROP TABLE IF EXISTS `revision_error_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `revision_error_codes` (
  `revision_id` bigint NOT NULL,
  `error_code_id` bigint NOT NULL,
  `confidence_score` float DEFAULT NULL,
  `detected_by` enum('AI','manual') NOT NULL DEFAULT 'manual',
  `comment` text,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`revision_id`,`error_code_id`),
  KEY `idx_rec_error` (`error_code_id`),
  CONSTRAINT `fk_rec_error` FOREIGN KEY (`error_code_id`) REFERENCES `error_codes` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rec_revision` FOREIGN KEY (`revision_id`) REFERENCES `drawing_revisions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `emp_id` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','user') NOT NULL DEFAULT 'user',
  `division` varchar(255) DEFAULT NULL,
  `pc` varchar(50) DEFAULT NULL,
  `team` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `emp_id` (`emp_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'atlascopco_drawing_db'
--

--
-- Dumping routines for database 'atlascopco_drawing_db'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-18  0:45:42
