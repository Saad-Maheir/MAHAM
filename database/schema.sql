-- =============================================================================
-- MAHAM FinTech Platform - Database Schema & Initial Seed Data
-- Target Database: MySQL 8.0+ / MariaDB 10.4+ (Hostinger Compatible)
-- Character Set: utf8mb4 / Collation: utf8mb4_unicode_ci
-- Architecture: Atomic Transactions, Foreign Keys, High-Throughput Indexing
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. Table: users
-- Core user entity with balance integrity and rate limit safeguards
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(30) NULL DEFAULT NULL,
  `password_hash` VARCHAR(255) NULL DEFAULT NULL,
  `google_id` VARCHAR(191) NULL DEFAULT NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `balance` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `pending_balance` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `free_tasks_used` INT UNSIGNED NOT NULL DEFAULT 0,
  `last_task_completed_at` DATETIME NULL DEFAULT NULL,
  `is_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('active', 'suspended', 'banned') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  UNIQUE KEY `uk_users_google_id` (`google_id`),
  KEY `idx_users_status_role` (`status`, `role`),
  KEY `idx_users_last_task` (`last_task_completed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. Table: packages (VIP & Free Tiers)
-- Central catalog for all platform subscription tiers
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `packages`;
CREATE TABLE `packages` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `price` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `daily_profit` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tasks_limit` INT NULL DEFAULT NULL COMMENT 'NULL represents infinite tasks (مفتوح ∞)',
  `cooldown_hours` INT UNSIGNED NOT NULL DEFAULT 0,
  `duration_days` INT UNSIGNED NOT NULL DEFAULT 30,
  `badge_name` VARCHAR(50) NOT NULL,
  `badge_color` VARCHAR(50) NOT NULL DEFAULT 'emerald',
  `description` TEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_packages_code` (`code`),
  KEY `idx_packages_active_order` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. Table: user_subscriptions
-- Active and historical user VIP subscription agreements
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `user_subscriptions`;
CREATE TABLE `user_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `package_id` INT UNSIGNED NOT NULL,
  `amount_paid` DECIMAL(14,2) NOT NULL,
  `daily_profit_rate` DECIMAL(14,2) NOT NULL,
  `starts_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `status` ENUM('active', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sub_user_status` (`user_id`, `status`),
  KEY `idx_sub_expires` (`expires_at`),
  CONSTRAINT `fk_sub_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sub_package` FOREIGN KEY (`package_id`) REFERENCES `packages` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. Table: tasks
-- Production micro-task repository available for user execution
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `tasks`;
CREATE TABLE `tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(250) NOT NULL,
  `description` TEXT NOT NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'interactive',
  `target_url` VARCHAR(500) NOT NULL,
  `attachment_url` VARCHAR(500) NULL DEFAULT NULL,
  `target_type` ENUM('all', 'specific') NOT NULL DEFAULT 'all',
  `target_user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `reward_amount` DECIMAL(14,2) NOT NULL DEFAULT 250.00,
  `required_seconds` INT UNSIGNED NOT NULL DEFAULT 30 COMMENT 'Strict anti-cheat timer duration',
  `min_vip_level` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tasks_target` (`target_type`, `target_user_id`, `is_active`),
  KEY `idx_tasks_active_level` (`is_active`, `min_vip_level`),
  CONSTRAINT `fk_tasks_target_user` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. Table: task_completions
-- Verification log and anti-cheat record for every claimed task
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `task_completions`;
CREATE TABLE `task_completions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `task_id` BIGINT UNSIGNED NOT NULL,
  `package_id` INT UNSIGNED NULL DEFAULT NULL,
  `reward_earned` DECIMAL(14,2) NOT NULL,
  `started_at` DATETIME NOT NULL,
  `completed_at` DATETIME NOT NULL,
  `duration_seconds` INT UNSIGNED NOT NULL,
  `verification_token` VARCHAR(64) NOT NULL,
  `status` ENUM('verified', 'rejected') NOT NULL DEFAULT 'verified',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_comp_user_completed` (`user_id`, `completed_at`),
  KEY `idx_comp_task` (`task_id`),
  CONSTRAINT `fk_comp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comp_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. Table: transactions
-- Comprehensive double-entry financial ledger for deposits, withdrawals,
-- task earnings, and package subscriptions.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `transactions`;
CREATE TABLE `transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tx_uuid` VARCHAR(36) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('deposit', 'withdraw', 'subscription_fee', 'task_reward') NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `balance_before` DECIMAL(14,2) NOT NULL,
  `balance_after` DECIMAL(14,2) NOT NULL,
  `payment_method` VARCHAR(50) NULL DEFAULT NULL COMMENT 'zain_cash, asia_hawala, qi_card, wallet_balance',
  `sender_account` VARCHAR(100) NULL DEFAULT NULL,
  `tx_reference` VARCHAR(100) NULL DEFAULT NULL,
  `receipt_image` VARCHAR(255) NULL DEFAULT NULL,
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `admin_notes` TEXT NULL DEFAULT NULL,
  `reviewed_by` BIGINT UNSIGNED NULL DEFAULT NULL,
  `reviewed_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tx_uuid` (`tx_uuid`),
  KEY `idx_tx_user_status` (`user_id`, `status`),
  KEY `idx_tx_type_created` (`type`, `created_at`),
  CONSTRAINT `fk_tx_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 7. Table: otp_codes
-- One-time passcode store with expiry and attempt throttling
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `otp_codes`;
CREATE TABLE `otp_codes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `email` VARCHAR(191) NOT NULL,
  `code` CHAR(6) NOT NULL,
  `type` ENUM('register', 'login', 'reset_password') NOT NULL DEFAULT 'register',
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `is_used` TINYINT(1) NOT NULL DEFAULT 0,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_otp_email_code` (`email`, `code`, `is_used`),
  KEY `idx_otp_expires` (`expires_at`),
  CONSTRAINT `fk_otp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 8. Table: app_settings
-- System-level parameters, operational limits, and official payment accounts
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `app_settings`;
CREATE TABLE `app_settings` (
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `description` VARCHAR(255) NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- SEED DATA: OFFICIAL PACKAGES & TIERS
-- Includes the 5 Official VIP Tiers alongside the Free Base Tier
-- =============================================================================

INSERT INTO `packages` (`id`, `name`, `code`, `price`, `daily_profit`, `tasks_limit`, `cooldown_hours`, `duration_days`, `badge_name`, `badge_color`, `description`, `is_active`, `sort_order`) VALUES
(1, 'الباقة الأساسية المجانية', 'free', 0.00, 250.00, 5, 24, 365, 'المجانية', 'slate', 'باقة الانطلاق المجانية - إجمالي 5 مهام مدى الحياة مع فاصل زمني 24 ساعة بين كل مهمة', 1, 0),
(2, 'الباقة الأولى (VIP 1)', 'vip_1', 25000.00, 250.00, NULL, 0, 30, 'برونزية VIP 1', 'amber', 'اشتراك شهري استثماري - ربح يومي ثابت 250 د.ع مع مهام يومية مفتوحة (∞)', 1, 1),
(3, 'الباقة الثانية (VIP 2)', 'vip_2', 50000.00, 500.00, NULL, 0, 30, 'فضية VIP 2', 'slate', 'اشتراك شهري مميز - ربح يومي ثابت 500 د.ع مع مهام يومية مفتوحة (∞)', 1, 2),
(4, 'الباقة الثالثة (VIP 3)', 'vip_3', 100000.00, 1000.00, NULL, 0, 30, 'ذهبية VIP 3', 'yellow', 'اشتراك المحترفين المتقدم - ربح يومي ثابت 1,000 د.ع مع مهام يومية مفتوحة (∞)', 1, 3),
(5, 'الباقة الرابعة (VIP 4)', 'vip_4', 200000.00, 2000.00, NULL, 0, 30, 'بلاتينية VIP 4', 'cyan', 'اشتراك كبار المستثمرين - ربح يومي ثابت 2,000 د.ع مع مهام يومية مفتوحة (∞)', 1, 4),
(6, 'الباقة الخامسة (VIP 5)', 'vip_5', 400000.00, 4000.00, NULL, 0, 30, 'ماسية VIP 5', 'emerald', 'اشتراك النخبة الاستثنائي - ربح يومي ثابت 4,000 د.ع مع مهام يومية مفتوحة (∞)', 1, 5);

-- =============================================================================
-- SEED DATA: OFFICIAL SETTINGS & PAYMENT DESTINATIONS
-- =============================================================================

INSERT INTO `app_settings` (`setting_key`, `setting_value`, `description`) VALUES
('zain_cash_number', '07801234567', 'رقم محفظة زين كاش المعتمد للإيداع'),
('asia_hawala_number', '07709876543', 'رقم محفظة آسيا حوالة المعتمد للإيداع'),
('qi_card_number', 'IQ98RAFB0000001234567890', 'رقم حساب كي كارد ومصرف الرافدين المعتمد'),
('official_account_name', 'شركة مهام للتكنولوجيا المالية ذ.م.م', 'الاسم الرسمي المسجل لدى المحافظ والمصارف'),
('min_deposit_iqd', '5000', 'الحد الأدنى للإيداع بالدينار العراقي'),
('min_withdraw_iqd', '5000', 'الحد الأدنى لسحب الأرباح بالدينار العراقي'),
('free_task_reward', '250', 'قيمة ربح المهمة الواحدة للباقة المجانية'),
('free_task_quota', '5', 'إجمالي عدد المهام المتاحة للباقة المجانية'),
('task_timer_seconds', '30', 'مدة عداد مكافحة الاحتيال بالثواني');

-- =============================================================================
-- SEED DATA: INITIAL HIGH-VALUE TASKS
-- =============================================================================

INSERT INTO `tasks` (`id`, `title`, `description`, `category`, `target_url`, `attachment_url`, `target_type`, `target_user_id`, `reward_amount`, `required_seconds`, `min_vip_level`, `is_active`) VALUES
(1, 'مشاهدة فيديو ترويجي رسمي لمنصة مهام', 'شاهد العرض التعريفي التوضيحي بالكامل لمدة 30 ثانية لدعم تصنيف المنصة وإضافة الأرباح لمحفظتك.', 'video', 'https://www.youtube.com', 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800', 'all', NULL, 250.00, 30, 0, 1),
(2, 'زيارة بوابة الشراكة الرقمية والتقييم', 'زيارة صفحة خدمات الشركاء المعتمدين والاطلاع على أحدث العروض والخدمات المالية المتاحة في العراق.', 'web', 'https://www.google.iq', NULL, 'all', NULL, 250.00, 30, 0, 1),
(3, 'متابعة قناة التحديثات الرسمية على تليجرام', 'الانضمام إلى القناة الإخبارية الموثقة للحصول على إشعارات المهام الاستثنائية والمسابقات الأسبوعية.', 'social', 'https://t.me', NULL, 'all', NULL, 250.00, 30, 0, 1),
(4, 'استطلاع رأي سريع حول خدمات الدفع الإلكتروني', 'الإجابة على استبيان تقييم تجربة المحافظ الرقمية في السوق العراقي للمساهمة في تحسين الخدمات.', 'survey', 'https://forms.google.com', NULL, 'all', NULL, 250.00, 30, 0, 1),
(5, 'زيارة تطبيق محفظة الدفع الشريكة', 'الاطلاع على تفاصيل خدمات التحويل الفوري وحلول تسوية الفواتير المعتمدة للمستخدمين.', 'web', 'https://www.zaincash.iq', NULL, 'all', NULL, 250.00, 30, 0, 1);

-- =============================================================================
-- SEED DATA: INITIAL ADMIN USER FOR PHASE 2 EXPANSION
-- Password: AdminPassword2026! (Bcrypt hashed)
-- =============================================================================

INSERT INTO `users` (`id`, `full_name`, `email`, `phone`, `password_hash`, `role`, `balance`, `pending_balance`, `free_tasks_used`, `is_verified`, `status`) VALUES
(1, 'الإدارة المركزية | MAHAM', 'admin@maham.iq', '07800000000', '$2y$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGPEWiSDe.6C4rU7u', 'admin', 0.00, 0.00, 0, 1, 'active');

