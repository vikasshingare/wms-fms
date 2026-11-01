-- Service360 schema and clean demo seed. No local credentials included.
-- Import into a fresh database; application tables are replaced.
CREATE DATABASE IF NOT EXISTS `service360` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `service360`;

-- MySQL dump 10.13  Distrib 8.4.9, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: service360
-- ------------------------------------------------------
-- Server version	8.4.9

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activities`
--

DROP TABLE IF EXISTS `activities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int NOT NULL,
  `action` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `actor_id` int NOT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `actor_id` (`actor_id`),
  CONSTRAINT `activities_ibfk_1` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activities`
--

LOCK TABLES `activities` WRITE;
/*!40000 ALTER TABLE `activities` DISABLE KEYS */;
INSERT INTO `activities` VALUES (1,'work_order',1,'ASSIGNED','WO-100245 assigned to Rahul Sharma',1,NULL,'2026-11-01 14:03:08'),(2,'carton',1,'QC_PASSED','MC-000781 passed inbound quality checks',1,NULL,'2026-11-01 14:03:08'),(3,'asn',2,'RECEIVED','GRN created for ASN-000562',1,NULL,'2026-11-01 14:03:08'),(4,'work_order',8,'COMPLETED','WO-100239 completed by Rahul Sharma',1,NULL,'2026-11-01 14:03:08'),(5,'transfer',1,'DISPATCHED','Stock dispatched from North Hub to Rahul Sharma',1,NULL,'2026-11-01 14:03:08'),(6,'return',1,'RETURN_REQUESTED','Return initiated for SN78451245',1,NULL,'2026-11-01 14:03:08');
/*!40000 ALTER TABLE `activities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `asns`
--

DROP TABLE IF EXISTS `asns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vendor` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` int NOT NULL,
  `warehouse` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT 'HO Warehouse',
  `expected_qty` int NOT NULL,
  `received_qty` int NOT NULL DEFAULT '0',
  `status` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT 'EXPECTED',
  `expected_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `asns_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asns`
--

LOCK TABLES `asns` WRITE;
/*!40000 ALTER TABLE `asns` DISABLE KEYS */;
INSERT INTO `asns` VALUES (1,'ASN-000561','TechSupply Solutions',1,'HO Warehouse',4,4,'QC_PASSED','2026-11-01','2026-11-01 14:03:08'),(2,'ASN-000562','TechSupply Solutions',1,'HO Warehouse',4,4,'RECEIVED','2026-11-01','2026-11-01 14:03:08'),(3,'ASN-000563','TechSupply Solutions',1,'HO Warehouse',4,0,'EXPECTED','2026-11-01','2026-11-01 14:03:08');
/*!40000 ALTER TABLE `asns` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `asset_site_assignments`
--

DROP TABLE IF EXISTS `asset_site_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_site_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `site_id` int NOT NULL,
  `work_order_id` int DEFAULT NULL,
  `active_from` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `active_to` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `asset_id` (`asset_id`),
  KEY `site_id` (`site_id`),
  CONSTRAINT `asset_site_assignments_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`),
  CONSTRAINT `asset_site_assignments_ibfk_2` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asset_site_assignments`
--

LOCK TABLES `asset_site_assignments` WRITE;
/*!40000 ALTER TABLE `asset_site_assignments` DISABLE KEYS */;
INSERT INTO `asset_site_assignments` VALUES (1,3,1,NULL,'2026-11-01 14:03:08',NULL),(2,10,1,NULL,'2026-11-01 14:03:08',NULL),(3,4,2,NULL,'2026-11-01 14:03:08',NULL),(4,12,2,NULL,'2026-11-01 14:03:08',NULL),(5,5,3,NULL,'2026-11-01 14:03:08',NULL),(6,6,4,NULL,'2026-11-01 14:03:08',NULL);
/*!40000 ALTER TABLE `asset_site_assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assets`
--

DROP TABLE IF EXISTS `assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `serial` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` int NOT NULL,
  `status` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `condition` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NEW',
  `location_id` int NOT NULL,
  `holder_user_id` int DEFAULT NULL,
  `site_id` int DEFAULT NULL,
  `customer_id` int DEFAULT NULL,
  `inner_carton_id` int DEFAULT NULL,
  `master_carton_id` int DEFAULT NULL,
  `original_inner_carton_id` int DEFAULT NULL,
  `original_master_carton_id` int DEFAULT NULL,
  `asn_id` int DEFAULT NULL,
  `grn_code` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `serial` (`serial`),
  KEY `product_id` (`product_id`),
  KEY `location_id` (`location_id`),
  KEY `holder_user_id` (`holder_user_id`),
  KEY `site_id` (`site_id`),
  KEY `customer_id` (`customer_id`),
  KEY `inner_carton_id` (`inner_carton_id`),
  KEY `master_carton_id` (`master_carton_id`),
  CONSTRAINT `assets_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `assets_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `assets_ibfk_3` FOREIGN KEY (`holder_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `assets_ibfk_4` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`),
  CONSTRAINT `assets_ibfk_5` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `assets_ibfk_6` FOREIGN KEY (`inner_carton_id`) REFERENCES `cartons` (`id`),
  CONSTRAINT `assets_ibfk_7` FOREIGN KEY (`master_carton_id`) REFERENCES `cartons` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assets`
--

LOCK TABLES `assets` WRITE;
/*!40000 ALTER TABLE `assets` DISABLE KEYS */;
INSERT INTO `assets` VALUES (1,'SN78451236',1,'ISSUED_TO_ENGINEER','NEW',6,3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(2,'SN78451237',1,'ISSUED_TO_ENGINEER','NEW',6,3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(3,'SN78451238',1,'INSTALLED','NEW',8,NULL,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(4,'SN78451239',1,'INSTALLED','NEW',9,NULL,2,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(5,'SN78451240',1,'INSTALLED','NEW',10,NULL,3,2,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(6,'SN78451241',1,'INSTALLED','NEW',11,NULL,4,3,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(7,'SN78451242',1,'IN_TRANSIT','NEW',4,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(8,'SN78451243',1,'IN_TRANSIT','NEW',4,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(9,'SC20000001',2,'ISSUED_TO_ENGINEER','NEW',6,3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(10,'SC20000002',2,'INSTALLED','NEW',8,NULL,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(11,'SC20000003',2,'AVAILABLE','NEW',3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(12,'TP80000001',3,'INSTALLED','NEW',9,NULL,2,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(13,'SN78451244',1,'ISSUED_TO_ENGINEER','NEW',7,4,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(14,'SN78451245',1,'RETURNED_TO_ENGINEER','NEW',6,3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(15,'SN78451246',1,'REPAIR','NEW',13,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(16,'SN-STOCK-0001',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(17,'SN-STOCK-0002',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(18,'SN-STOCK-0003',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(19,'SN-STOCK-0004',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(20,'SN-STOCK-0005',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(21,'SN-STOCK-0006',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(22,'SN-STOCK-0007',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(23,'SN-STOCK-0008',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(24,'SN-STOCK-0009',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(25,'SN-STOCK-0010',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(26,'SN-STOCK-0011',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(27,'SN-STOCK-0012',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(28,'SN-STOCK-0013',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(29,'SN-STOCK-0014',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(30,'SN-STOCK-0015',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(31,'SN-STOCK-0016',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(32,'SN-STOCK-0017',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(33,'SN-STOCK-0018',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(34,'SN-STOCK-0019',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(35,'SN-STOCK-0020',1,'AVAILABLE','NEW',2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(36,'POS-111-2026',1,'RECEIVED','NEW',1,NULL,NULL,NULL,2,1,2,1,1,'GRN-000341','2026-11-01 14:03:08','2026-11-01 14:03:08'),(37,'POS-112-2026',1,'RECEIVED','NEW',1,NULL,NULL,NULL,2,1,2,1,1,'GRN-000341','2026-11-01 14:03:08','2026-11-01 14:03:08'),(38,'POS-121-2026',1,'RECEIVED','NEW',1,NULL,NULL,NULL,3,1,3,1,1,'GRN-000341','2026-11-01 14:03:08','2026-11-01 14:03:08'),(39,'POS-122-2026',1,'RECEIVED','NEW',1,NULL,NULL,NULL,3,1,3,1,1,'GRN-000341','2026-11-01 14:03:08','2026-11-01 14:03:08'),(40,'POS-211-2026',1,'RECEIVED','NEW',1,NULL,NULL,NULL,5,4,5,4,2,'GRN-000342','2026-11-01 14:03:08','2026-11-01 14:03:08'),(41,'POS-212-2026',1,'RECEIVED','NEW',1,NULL,NULL,NULL,5,4,5,4,2,'GRN-000342','2026-11-01 14:03:08','2026-11-01 14:03:08'),(42,'POS-221-2026',1,'RECEIVED','NEW',1,NULL,NULL,NULL,6,4,6,4,2,'GRN-000342','2026-11-01 14:03:08','2026-11-01 14:03:08'),(43,'POS-222-2026',1,'RECEIVED','NEW',1,NULL,NULL,NULL,6,4,6,4,2,'GRN-000342','2026-11-01 14:03:08','2026-11-01 14:03:08'),(44,'POS-311-2026',1,'EXPECTED','NEW',1,NULL,NULL,NULL,8,7,8,7,3,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(45,'POS-312-2026',1,'EXPECTED','NEW',1,NULL,NULL,NULL,8,7,8,7,3,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(46,'POS-321-2026',1,'EXPECTED','NEW',1,NULL,NULL,NULL,9,7,9,7,3,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08'),(47,'POS-322-2026',1,'EXPECTED','NEW',1,NULL,NULL,NULL,9,7,9,7,3,NULL,'2026-11-01 14:03:08','2026-11-01 14:03:08');
/*!40000 ALTER TABLE `assets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance`
--

DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `date` date NOT NULL,
  `check_in` datetime DEFAULT NULL,
  `check_out` datetime DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `attendance_day` (`user_id`,`date`),
  CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `carton_break_events`
--

DROP TABLE IF EXISTS `carton_break_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `carton_break_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `parent_id` int NOT NULL,
  `child_ids` json DEFAULT NULL,
  `serials` json DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `carton_break_events`
--

LOCK TABLES `carton_break_events` WRITE;
/*!40000 ALTER TABLE `carton_break_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `carton_break_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cartons`
--

DROP TABLE IF EXISTS `cartons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cartons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `barcode` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` int DEFAULT NULL,
  `original_parent_id` int DEFAULT NULL,
  `product_id` int NOT NULL,
  `asn_id` int NOT NULL,
  `qty` int NOT NULL,
  `status` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EXPECTED',
  `sealed` tinyint(1) NOT NULL DEFAULT '1',
  `location_id` int NOT NULL,
  `grn_code` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `barcode` (`barcode`),
  KEY `parent_id` (`parent_id`),
  KEY `product_id` (`product_id`),
  KEY `asn_id` (`asn_id`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `cartons_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `cartons` (`id`),
  CONSTRAINT `cartons_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `cartons_ibfk_3` FOREIGN KEY (`asn_id`) REFERENCES `asns` (`id`),
  CONSTRAINT `cartons_ibfk_4` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cartons`
--

LOCK TABLES `cartons` WRITE;
/*!40000 ALTER TABLE `cartons` DISABLE KEYS */;
INSERT INTO `cartons` VALUES (1,'MC-000781','MASTER_CARTON',NULL,NULL,1,1,4,'QC_PASSED',1,1,'GRN-000341'),(2,'IC-00101','INNER_CARTON',1,1,1,1,2,'QC_PASSED',1,1,'GRN-000341'),(3,'IC-00102','INNER_CARTON',1,1,1,1,2,'QC_PASSED',1,1,'GRN-000341'),(4,'MC-000782','MASTER_CARTON',NULL,NULL,1,2,4,'RECEIVED',1,1,'GRN-000342'),(5,'IC-00201','INNER_CARTON',4,4,1,2,2,'RECEIVED',1,1,'GRN-000342'),(6,'IC-00202','INNER_CARTON',4,4,1,2,2,'RECEIVED',1,1,'GRN-000342'),(7,'MC-000783','MASTER_CARTON',NULL,NULL,1,3,4,'EXPECTED',1,1,NULL),(8,'IC-00301','INNER_CARTON',7,7,1,3,2,'EXPECTED',1,1,NULL),(9,'IC-00302','INNER_CARTON',7,7,1,3,2,'EXPECTED',1,1,NULL);
/*!40000 ALTER TABLE `cartons` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `checklist_templates`
--

DROP TABLE IF EXISTS `checklist_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `checklist_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `items` json NOT NULL,
  `evidence_types` json NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `checklist_templates`
--

LOCK TABLES `checklist_templates` WRITE;
/*!40000 ALTER TABLE `checklist_templates` DISABLE KEYS */;
INSERT INTO `checklist_templates` VALUES (1,'Standard field service',1,'[{\"id\": \"site_verified\", \"label\": \"Customer and site details verified\", \"required\": true}, {\"id\": \"installation_tested\", \"label\": \"Installation / service tests passed\", \"required\": true}, {\"id\": \"customer_briefed\", \"label\": \"Customer briefed on completed work\", \"required\": true}]','[\"Shop front\", \"Inside shop\", \"Installed device\"]');
/*!40000 ALTER TABLE `checklist_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `industry` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sla_hours` int NOT NULL DEFAULT '48',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customers`
--

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
INSERT INTO `customers` VALUES (1,'CUS-001','ACME Retail Pvt. Ltd.','Retail','John Mathew','john@acme.example','+91 98765 43210',48,'2026-11-01 14:03:08'),(2,'CUS-002','Delta Electronics','Electronics','Meera Shah','meera@delta.example','+91 98765 43211',24,'2026-11-01 14:03:08'),(3,'CUS-003','City Mart','Retail','Vikram Rao','vikram@citymart.example','+91 98765 43212',48,'2026-11-01 14:03:08');
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `evidence`
--

DROP TABLE IF EXISTS `evidence`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evidence` (
  `id` int NOT NULL AUTO_INCREMENT,
  `work_order_id` int NOT NULL,
  `type` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `captured_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `work_order_id` (`work_order_id`),
  KEY `captured_by` (`captured_by`),
  CONSTRAINT `evidence_ibfk_1` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`),
  CONSTRAINT `evidence_ibfk_2` FOREIGN KEY (`captured_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `evidence`
--

LOCK TABLES `evidence` WRITE;
/*!40000 ALTER TABLE `evidence` DISABLE KEYS */;
/*!40000 ALTER TABLE `evidence` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `locations`
--

DROP TABLE IF EXISTS `locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `region` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity` int NOT NULL DEFAULT '10000',
  `product_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `locations_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `locations`
--

LOCK TABLES `locations` WRITE;
/*!40000 ALTER TABLE `locations` DISABLE KEYS */;
INSERT INTO `locations` VALUES (1,'HO-STAGING','HO Receiving / Staging','STAGING','Central',1000,NULL),(2,'A-01-01','HO Warehouse · Bin A-01-01','BIN','Central',200,1),(3,'A-01-02','HO Warehouse · Bin A-01-02','BIN','Central',200,2),(4,'NORTH-HUB','Region — North','HUB','North',2000,NULL),(5,'SOUTH-HUB','Region — South','HUB','South',2000,NULL),(6,'FSE-RAHUL','Rahul Sharma · Field Stock','ENGINEER','North',100,NULL),(7,'FSE-PRIYA','Priya Nair · Field Stock','ENGINEER','South',100,NULL),(8,'SITE-ABC','ABC Retail Store','SITE','North',100,NULL),(9,'SITE-ACME','ACME Flagship Store','SITE','North',100,NULL),(10,'SITE-DELTA','Delta Electronics','SITE','South',100,NULL),(11,'SITE-CITY','City Mart','SITE','North',100,NULL),(12,'QC-HOLD','HO Quarantine','QUARANTINE','Central',500,NULL),(13,'REPAIR-HO','Central Repair Centre','REPAIR','Central',500,NULL),(14,'B-01-01','HO Warehouse · Bin B-01-01','BIN','Central',200,3);
/*!40000 ALTER TABLE `locations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `movements`
--

DROP TABLE IF EXISTS `movements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `movements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int DEFAULT NULL,
  `carton_id` int DEFAULT NULL,
  `from_location_id` int DEFAULT NULL,
  `to_location_id` int NOT NULL,
  `movement_type` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_id` int DEFAULT NULL,
  `actor_id` int NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `asset_id` (`asset_id`),
  KEY `carton_id` (`carton_id`),
  CONSTRAINT `movements_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`),
  CONSTRAINT `movements_ibfk_2` FOREIGN KEY (`carton_id`) REFERENCES `cartons` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `movements`
--

LOCK TABLES `movements` WRITE;
/*!40000 ALTER TABLE `movements` DISABLE KEYS */;
INSERT INTO `movements` VALUES (1,1,NULL,NULL,6,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(2,2,NULL,NULL,6,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(3,3,NULL,NULL,8,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(4,4,NULL,NULL,9,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(5,5,NULL,NULL,10,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(6,6,NULL,NULL,11,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(7,7,NULL,NULL,4,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(8,8,NULL,NULL,4,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(9,9,NULL,NULL,6,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(10,10,NULL,NULL,8,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(11,11,NULL,NULL,3,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(12,12,NULL,NULL,9,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(13,13,NULL,NULL,7,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(14,14,NULL,NULL,6,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(15,15,NULL,NULL,13,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(16,16,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(17,17,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(18,18,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(19,19,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(20,20,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(21,21,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(22,22,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(23,23,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(24,24,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(25,25,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(26,26,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(27,27,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(28,28,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(29,29,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(30,30,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(31,31,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(32,32,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(33,33,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(34,34,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(35,35,NULL,NULL,2,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(36,36,NULL,NULL,1,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(37,37,NULL,NULL,1,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(38,38,NULL,NULL,1,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(39,39,NULL,NULL,1,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(40,40,NULL,NULL,1,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(41,41,NULL,NULL,1,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(42,42,NULL,NULL,1,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08'),(43,43,NULL,NULL,1,'OPENING_BALANCE','seed',NULL,1,'Seeded local demonstration inventory','2026-11-01 14:03:08');
/*!40000 ALTER TABLE `movements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sku` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serialized` tinyint(1) NOT NULL DEFAULT '1',
  `units_per_inner_carton` int NOT NULL DEFAULT '2',
  `inner_cartons_per_master` int NOT NULL DEFAULT '2',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (1,'POS-PRO-X1','POS Terminal','Pro X1','Devices',1,2,2,'2026-11-01 14:03:08'),(2,'SCAN-S200','Barcode Scanner','S200','Devices',1,2,2,'2026-11-01 14:03:08'),(3,'PRINT-T80','Thermal Printer','T80','Accessories',1,2,2,'2026-11-01 14:03:08');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `putaway_tasks`
--

DROP TABLE IF EXISTS `putaway_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `putaway_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `carton_id` int DEFAULT NULL,
  `asset_id` int DEFAULT NULL,
  `product_id` int NOT NULL,
  `expected_qty` int NOT NULL,
  `putaway_qty` int NOT NULL DEFAULT '0',
  `source_location_id` int NOT NULL,
  `suggested_location_id` int NOT NULL,
  `actual_location_id` int DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `completed_at` datetime DEFAULT NULL,
  `operator_user_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `carton_id` (`carton_id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `putaway_tasks_ibfk_1` FOREIGN KEY (`carton_id`) REFERENCES `cartons` (`id`),
  CONSTRAINT `putaway_tasks_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `putaway_tasks`
--

LOCK TABLES `putaway_tasks` WRITE;
/*!40000 ALTER TABLE `putaway_tasks` DISABLE KEYS */;
INSERT INTO `putaway_tasks` VALUES (1,'PA-000128',1,NULL,1,4,0,1,2,NULL,'OPEN',NULL,NULL);
/*!40000 ALTER TABLE `putaway_tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `return_records`
--

DROP TABLE IF EXISTS `return_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `return_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_id` int NOT NULL,
  `source_location_id` int NOT NULL,
  `destination_location_id` int NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `condition` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT 'USED',
  `status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'AWAITING_RECEIPT',
  `disposition` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `received_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `asset_id` (`asset_id`),
  KEY `source_location_id` (`source_location_id`),
  KEY `destination_location_id` (`destination_location_id`),
  CONSTRAINT `return_records_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`),
  CONSTRAINT `return_records_ibfk_2` FOREIGN KEY (`source_location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `return_records_ibfk_3` FOREIGN KEY (`destination_location_id`) REFERENCES `locations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `return_records`
--

LOCK TABLES `return_records` WRITE;
/*!40000 ALTER TABLE `return_records` DISABLE KEYS */;
INSERT INTO `return_records` VALUES (1,'RT-000032',14,6,4,'Screen damage reported at customer site','DAMAGED','AWAITING_RECEIPT',NULL,3,'2026-11-01 14:03:08',NULL),(2,'RT-000031',15,4,13,'Power supply fault','DAMAGED','REPAIR',NULL,1,'2026-11-01 14:03:08',NULL);
/*!40000 ALTER TABLE `return_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sites`
--

DROP TABLE IF EXISTS `sites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int NOT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_phone` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `geofence_radius` int DEFAULT '500',
  `location_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `customer_id` (`customer_id`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `sites_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `sites_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sites`
--

LOCK TABLES `sites` WRITE;
/*!40000 ALTER TABLE `sites` DISABLE KEYS */;
INSERT INTO `sites` VALUES (1,'SIT-00045','ABC Retail Store',1,'24, MG Road, Connaught Place','New Delhi','North','Amit Kapoor','+91 98765 41001',28.6315000,77.2167000,500,8),(2,'SIT-00046','ACME Flagship Store',1,'18, Sector 18 Market','Noida','North','Anita Singh','+91 98765 41002',28.5706000,77.3272000,500,9),(3,'SIT-00047','Delta Electronics',2,'45, Residency Road','Bengaluru','South','Meera Shah','+91 98765 41003',12.9716000,77.5946000,500,10),(4,'SIT-00048','City Mart',3,'72, Civil Lines','New Delhi','North','Vikram Rao','+91 98765 41004',28.6833000,77.2264000,500,11);
/*!40000 ALTER TABLE `sites` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sync_events`
--

DROP TABLE IF EXISTS `sync_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sync_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `mobile_txn_id` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `response` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sync_user_txn` (`user_id`,`mobile_txn_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sync_events`
--

LOCK TABLES `sync_events` WRITE;
/*!40000 ALTER TABLE `sync_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `sync_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transfers`
--

DROP TABLE IF EXISTS `transfers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transfers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_location_id` int NOT NULL,
  `destination_location_id` int NOT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'RESERVED',
  `asset_ids` json NOT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `dispatched_at` datetime DEFAULT NULL,
  `received_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `source_location_id` (`source_location_id`),
  KEY `destination_location_id` (`destination_location_id`),
  CONSTRAINT `transfers_ibfk_1` FOREIGN KEY (`source_location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `transfers_ibfk_2` FOREIGN KEY (`destination_location_id`) REFERENCES `locations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transfers`
--

LOCK TABLES `transfers` WRITE;
/*!40000 ALTER TABLE `transfers` DISABLE KEYS */;
INSERT INTO `transfers` VALUES (1,'ST-000084',4,6,'IN_TRANSIT','[7, 8]',1,'2026-11-01 14:03:08',NULL,NULL);
/*!40000 ALTER TABLE `transfers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int DEFAULT NULL,
  `location_id` int DEFAULT NULL,
  `region` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `skills` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `customer_id` (`customer_id`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `users_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Alex Morgan','admin@service360.local','$2b$12$S8cBdCXCRSmqoe5u6vMqH.rNsk1lxCK4hnZylKeYLM8ouJR38PUna','admin',NULL,NULL,'All','Operations'),(2,'John Mathew','customer@service360.local','$2b$12$S8cBdCXCRSmqoe5u6vMqH.rNsk1lxCK4hnZylKeYLM8ouJR38PUna','customer',1,NULL,'North',NULL),(3,'Rahul Sharma','rahul@service360.local','$2b$12$S8cBdCXCRSmqoe5u6vMqH.rNsk1lxCK4hnZylKeYLM8ouJR38PUna','engineer',NULL,6,'North','Installation, Service, Replacement'),(4,'Priya Nair','priya@service360.local','$2b$12$S8cBdCXCRSmqoe5u6vMqH.rNsk1lxCK4hnZylKeYLM8ouJR38PUna','engineer',NULL,7,'South','Installation, Service, Inspection');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `work_orders`
--

DROP TABLE IF EXISTS `work_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CREATED',
  `priority` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Medium',
  `summary` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `customer_id` int NOT NULL,
  `site_id` int NOT NULL,
  `engineer_id` int DEFAULT NULL,
  `asset_id` int DEFAULT NULL,
  `allocated_asset_id` int DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `scheduled_at` datetime DEFAULT NULL,
  `due_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `resolution` text COLLATE utf8mb4_unicode_ci,
  `checklist` json DEFAULT NULL,
  `evidence` json DEFAULT NULL,
  `confirmation` json DEFAULT NULL,
  `version` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `customer_id` (`customer_id`),
  KEY `site_id` (`site_id`),
  KEY `engineer_id` (`engineer_id`),
  KEY `asset_id` (`asset_id`),
  KEY `allocated_asset_id` (`allocated_asset_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `work_orders_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `work_orders_ibfk_2` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`),
  CONSTRAINT `work_orders_ibfk_3` FOREIGN KEY (`engineer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `work_orders_ibfk_4` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`),
  CONSTRAINT `work_orders_ibfk_5` FOREIGN KEY (`allocated_asset_id`) REFERENCES `assets` (`id`),
  CONSTRAINT `work_orders_ibfk_6` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_orders`
--

LOCK TABLES `work_orders` WRITE;
/*!40000 ALTER TABLE `work_orders` DISABLE KEYS */;
INSERT INTO `work_orders` VALUES (1,'WO-100245','Installation','ASSIGNED','High','Install a new POS terminal at checkout','Install a new POS terminal at checkout',1,1,3,NULL,1,1,'2026-11-01 10:00:00','2026-11-03 14:03:08','2026-11-01 14:03:08',NULL,NULL,'[]','[]',NULL,1),(2,'WO-100246','Service','IN_PROGRESS','High','Payment terminal intermittently disconnects','Payment terminal intermittently disconnects',3,4,3,6,NULL,1,'2026-11-01 13:00:00','2026-11-03 14:03:08','2026-11-01 14:03:08',NULL,NULL,'[]','[]',NULL,1),(3,'WO-100247','De-installation','ASSIGNED','Medium','Remove terminal from the old service counter','Remove terminal from the old service counter',2,3,3,5,NULL,1,'2026-11-01 15:30:00','2026-11-03 14:03:08','2026-11-01 14:03:08',NULL,NULL,'[]','[]',NULL,1),(4,'WO-100248','Replacement','ASSIGNED','High','Replace damaged checkout terminal','Replace damaged checkout terminal',1,2,3,4,2,1,'2026-11-01 16:00:00','2026-11-03 14:03:08','2026-11-01 14:03:08',NULL,NULL,'[]','[]',NULL,1),(5,'WO-100249','Preventive Maintenance','CREATED','Low','Quarterly equipment health check','Quarterly equipment health check',1,1,NULL,3,NULL,1,'2026-11-01 11:30:00','2026-11-03 14:03:08','2026-11-01 14:03:08',NULL,NULL,'[]','[]',NULL,1),(6,'WO-100250','Inspection','PENDING','Medium','Network and site readiness inspection','Network and site readiness inspection',2,3,4,NULL,NULL,1,'2026-11-01 14:00:00','2026-11-03 14:03:08','2026-11-01 14:03:08',NULL,NULL,'[]','[]',NULL,1),(7,'WO-100238','Installation','CLOSED','Medium','Install thermal receipt printer','Install thermal receipt printer',1,2,4,12,NULL,3,'2026-11-01 09:00:00','2026-11-03 14:03:08','2026-11-01 14:03:08','2026-11-01 14:03:08','Service verified and customer confirmation recorded.','[]','[]',NULL,1),(8,'WO-100239','Service','COMPLETED','Medium','Scanner connectivity resolved','Scanner connectivity resolved',1,1,3,10,NULL,2,'2026-11-01 09:00:00','2026-11-03 14:03:08','2026-11-01 14:03:08','2026-11-01 14:03:08','Service verified and customer confirmation recorded.','[]','[]',NULL,1),(9,'WO-100240','Service','CLOSED','Low','Firmware upgrade completed','Firmware upgrade completed',1,1,3,3,NULL,1,'2026-11-01 09:00:00','2026-11-03 14:03:08','2026-11-01 14:03:08','2026-11-01 14:03:08','Service verified and customer confirmation recorded.','[]','[]',NULL,1),(10,'WO-100251','Installation','CREATED','Medium','New terminal for seasonal checkout','New terminal for seasonal checkout',1,2,NULL,NULL,NULL,1,'2026-11-01 17:00:00','2026-11-03 14:03:08','2026-11-01 14:03:08',NULL,NULL,'[]','[]',NULL,1);
/*!40000 ALTER TABLE `work_orders` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed
