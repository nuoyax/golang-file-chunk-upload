/*
 Navicat Premium Data Transfer

 Source Server         : Demo
 Source Server Type    : MySQL
 Source Server Version : 80028
 Source Host           : localhost:3306
 Source Schema         : filedb

 Target Server Type    : MySQL
 Target Server Version : 80028
 File Encoding         : 65001

 Date: 19/10/2025 18:27:47
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for upload_chunks
-- ----------------------------
DROP TABLE IF EXISTS `upload_chunks`;
CREATE TABLE `upload_chunks`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `upload_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `chunk_index` int NULL DEFAULT NULL,
  `chunk_size` int NULL DEFAULT NULL,
  `chunk_md5` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `received_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `upload_id`(`upload_id` ASC, `chunk_index` ASC) USING BTREE,
  INDEX `upload_id_2`(`upload_id` ASC) USING BTREE,
  CONSTRAINT `upload_chunks_ibfk_1` FOREIGN KEY (`upload_id`) REFERENCES `uploads` (`upload_id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for uploads
-- ----------------------------
DROP TABLE IF EXISTS `uploads`;
CREATE TABLE `uploads`  (
  `upload_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `total_size` bigint NOT NULL,
  `chunk_size` int NOT NULL,
  `total_chunks` int NOT NULL,
  `status` enum('in_progress','completed','failed') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT 'in_progress',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `extra` json NULL,
  PRIMARY KEY (`upload_id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
