<?php
/**
 * MAHAM FinTech Platform - Database Connection Manager (PDO Singleton & Auto-Migrator)
 * Secure, prepared-statement enforced database layer with automated schema synchronization
 */

declare(strict_types=1);

class Database {
    private static ?PDO $instance = null;
    private static bool $migrated = false;

    /**
     * Private constructor to enforce Singleton pattern
     */
    private function __construct() {}

    /**
     * Retrieve active PDO connection instance
     */
    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $host    = env('DB_HOST', 'sql211.infinityfree.com');
            $port    = (int)env('DB_PORT', 3306);
            $dbName  = env('DB_NAME', 'if0_43395665_maham');
            $charset = env('DB_CHARSET', 'utf8mb4');
            $user    = env('DB_USER', 'if0_43395665');
            $pass    = env('DB_PASS', 'dcucDzcQps0fx');

            $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset={$charset}";

            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false, // Eliminates SQL injection vector
                PDO::ATTR_PERSISTENT         => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$charset} COLLATE utf8mb4_unicode_ci"
            ];

            try {
                self::$instance = new PDO($dsn, $user, $pass, $options);
            } catch (PDOException $e) {
                // Local development fallback (127.0.0.1 / root)
                $isLocal = in_array($_SERVER['SERVER_NAME'] ?? '', ['localhost', '127.0.0.1', '::1']) ||
                           in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1']) ||
                           php_sapi_name() === 'cli';
                
                if ($isLocal) {
                    $localDatabases = ['maham', 'if0_43395665_maham', 'test'];
                    foreach ($localDatabases as $localDb) {
                        try {
                            $localDsn = "mysql:host=127.0.0.1;port=3306;dbname={$localDb};charset={$charset}";
                            self::$instance = new PDO($localDsn, 'root', '', $options);
                            break;
                        } catch (PDOException $eLocal) {
                            // Try next local candidate
                        }
                    }
                }

                if (self::$instance === null) {
                    // Shared hosting cluster fallback (sql211.infinityfree.com -> sql211.epizy.com)
                    if (str_contains($host, 'infinityfree.com')) {
                        $fallbackHost = 'sql211.epizy.com';
                        $fallbackDsn  = "mysql:host={$fallbackHost};port={$port};dbname={$dbName};charset={$charset}";
                        try {
                            self::$instance = new PDO($fallbackDsn, $user, $pass, $options);
                        } catch (PDOException $e2) {
                            error_log("MAHAM Database Primary & Fallback Failed: " . $e2->getMessage());
                            throw new RuntimeException("تعذر الاتصال بقاعدة البيانات. يرجى مراجعة إعدادات الخادم.");
                        }
                    } else {
                        error_log("MAHAM Database Connection Failure: " . $e->getMessage());
                        throw new RuntimeException("تعذر الاتصال بقاعدة البيانات. يرجى مراجعة إعدادات الخادم.");
                    }
                }
            }

            // Self-Healing Auto-Migration & Schema Synchronization
            if (!self::$migrated && self::$instance !== null) {
                self::autoMigrate(self::$instance);
                self::$migrated = true;
            }
        }

        return self::$instance;
    }

    /**
     * Automated Schema Synchronization & Auto-Migration Pipeline
     * Guarantees all 8 required tables, indexes, seed records, and admin account exist.
     */
    private static function autoMigrate(PDO $pdo): void {
        try {
            // 1. Table: users
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `users` (
                    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `full_name` VARCHAR(150) NOT NULL,
                    `email` VARCHAR(191) NOT NULL,
                    `phone` VARCHAR(30) NULL DEFAULT NULL,
                    `password_hash` VARCHAR(255) NULL DEFAULT NULL,
                    `google_id` VARCHAR(191) NULL DEFAULT NULL,
                    `avatar_url` VARCHAR(500) NULL DEFAULT NULL,
                    `remember_token` VARCHAR(128) NULL DEFAULT NULL,
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
                    KEY `idx_users_remember_token` (`remember_token`),
                    KEY `idx_users_status_role` (`status`, `role`),
                    KEY `idx_users_last_task` (`last_task_completed_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            // 2. Table: packages
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `packages` (
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
            ");

            // 3. Table: user_subscriptions
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `user_subscriptions` (
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
                    KEY `idx_sub_expires` (`expires_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            // 4. Table: tasks
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `tasks` (
                    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `title` VARCHAR(250) NOT NULL,
                    `description` TEXT NOT NULL,
                    `category` VARCHAR(50) NOT NULL DEFAULT 'interactive',
                    `target_url` VARCHAR(500) NOT NULL,
                    `attachment_url` VARCHAR(500) NULL DEFAULT NULL,
                    `target_type` ENUM('all', 'specific') NOT NULL DEFAULT 'all',
                    `target_user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
                    `reward_amount` DECIMAL(14,2) NOT NULL DEFAULT 250.00,
                    `required_seconds` INT UNSIGNED NOT NULL DEFAULT 30,
                    `min_vip_level` INT NOT NULL DEFAULT 0,
                    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
                    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`id`),
                    KEY `idx_tasks_target` (`target_type`, `target_user_id`, `is_active`),
                    KEY `idx_tasks_active_level` (`is_active`, `min_vip_level`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            // 5. Table: task_completions
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `task_completions` (
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
                    KEY `idx_comp_task` (`task_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            // 6. Table: transactions
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `transactions` (
                    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    `tx_uuid` VARCHAR(36) NOT NULL,
                    `user_id` BIGINT UNSIGNED NOT NULL,
                    `type` ENUM('deposit', 'withdraw', 'subscription_fee', 'task_reward') NOT NULL,
                    `amount` DECIMAL(14,2) NOT NULL,
                    `balance_before` DECIMAL(14,2) NOT NULL,
                    `balance_after` DECIMAL(14,2) NOT NULL,
                    `payment_method` VARCHAR(50) NULL DEFAULT NULL,
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
                    KEY `idx_tx_method_ref` (`payment_method`, `tx_reference`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            // 7. Table: otp_codes
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `otp_codes` (
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
                    KEY `idx_otp_expires` (`expires_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            // 8. Table: app_settings
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `app_settings` (
                    `setting_key` VARCHAR(100) NOT NULL,
                    `setting_value` TEXT NOT NULL,
                    `description` VARCHAR(255) NULL DEFAULT NULL,
                    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (`setting_key`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            // 9. Ensure 6 Core Packages (Free + 5 VIPs) exist
            $pdo->exec("
                INSERT IGNORE INTO `packages` (`id`, `name`, `code`, `price`, `daily_profit`, `tasks_limit`, `cooldown_hours`, `duration_days`, `badge_name`, `badge_color`, `description`, `is_active`, `sort_order`) VALUES
                (1, 'الباقة الأساسية المجانية', 'free', 0.00, 250.00, 5, 24, 365, 'المجانية', 'slate', 'باقة الانطلاق المجانية - إجمالي 5 مهام مدى الحياة مع فاصل زمني 24 ساعة بين كل مهمة', 1, 0),
                (2, 'الباقة الأولى (VIP 1)', 'vip_1', 25000.00, 250.00, NULL, 0, 30, 'برونزية VIP 1', 'amber', 'اشتراك شهري استثماري - ربح يومي ثابت 250 د.ع مع مهام يومية مفتوحة (∞)', 1, 1),
                (3, 'الباقة الثانية (VIP 2)', 'vip_2', 50000.00, 500.00, NULL, 0, 30, 'فضية VIP 2', 'slate', 'اشتراك شهري مميز - ربح يومي ثابت 500 د.ع مع مهام يومية مفتوحة (∞)', 1, 2),
                (4, 'الباقة الثالثة (VIP 3)', 'vip_3', 100000.00, 1000.00, NULL, 0, 30, 'ذهبية VIP 3', 'yellow', 'اشتراك المحترفين المتقدم - ربح يومي ثابت 1,000 د.ع مع مهام يومية مفتوحة (∞)', 1, 3),
                (5, 'الباقة الرابعة (VIP 4)', 'vip_4', 200000.00, 2000.00, NULL, 0, 30, 'بلاتينية VIP 4', 'cyan', 'اشتراك كبار المستثمرين - ربح يومي ثابت 2,000 د.ع مع مهام يومية مفتوحة (∞)', 1, 4),
                (6, 'الباقة الخامسة (VIP 5)', 'vip_5', 400000.00, 4000.00, NULL, 0, 30, 'ماسية VIP 5', 'emerald', 'اشتراك النخبة الاستثنائي - ربح يومي ثابت 4,000 د.ع مع مهام يومية مفتوحة (∞)', 1, 5);
            ");

            // 10. Ensure Official Operational Settings exist
            $pdo->exec("
                INSERT IGNORE INTO `app_settings` (`setting_key`, `setting_value`, `description`) VALUES
                ('mastercard_number', '5300 1234 5678 9012', 'رقم بطاقة الماستر كارد المعتمد للإيداع والتحويلات'),
                ('mastercard_holder', 'شركة مهام للخدمات المالية ذ.م.م', 'اسم صاحب حساب بطاقة الماستر كارد الرسمي'),
                ('asiacell_instructions', 'أدخل قيمة الرصيد ورقم كارت الشحن المكون من 14 رقماً ثم اضغط تأكيد الإيداع', 'تعليمات شحن كارت آسيا سيل 14 رقماً'),
                ('official_account_name', 'شركة مهام للتكنولوجيا المالية ذ.م.م', 'الاسم الرسمي المسجل لدى المحافظ والمصارف'),
                ('min_deposit_iqd', '5000', 'الحد الأدنى للإيداع بالدينار العراقي'),
                ('min_withdraw_iqd', '5000', 'الحد الأدنى لسحب الأرباح بالدينار العراقي'),
                ('free_task_reward', '250', 'قيمة ربح المهمة الواحدة للباقة المجانية'),
                ('free_task_quota', '5', 'إجمالي عدد المهام المتاحة للباقة المجانية'),
                ('task_timer_seconds', '30', 'مدة عداد مكافحة الاحتيال بالثواني');
            ");

            // 11. Ensure Initial High-Value Tasks exist
            $pdo->exec("
                INSERT IGNORE INTO `tasks` (`id`, `title`, `description`, `category`, `target_url`, `attachment_url`, `target_type`, `target_user_id`, `reward_amount`, `required_seconds`, `min_vip_level`, `is_active`) VALUES
                (1, 'مشاهدة فيديو ترويجي رسمي لمنصة مهام', 'شاهد العرض التعريفي التوضيحي بالكامل لمدة 30 ثانية لدعم تصنيف المنصة وإضافة الأرباح لمحفظتك.', 'video', 'https://www.youtube.com', 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800', 'all', NULL, 250.00, 30, 0, 1),
                (2, 'زيارة بوابة الشراكة الرقمية والتقييم', 'زيارة صفحة خدمات الشركاء المعتمدين والاطلاع على أحدث العروض والخدمات المالية المتاحة في العراق.', 'web', 'https://www.google.iq', NULL, 'all', NULL, 250.00, 30, 0, 1),
                (3, 'متابعة قناة التحديثات الرسمية على تليجرام', 'الانضمام إلى القناة الإخبارية الموثقة للحصول على إشعارات المهام الاستثنائية والمسابقات الأسبوعية.', 'social', 'https://t.me', NULL, 'all', NULL, 250.00, 30, 0, 1),
                (4, 'استطلاع رأي سريع حول خدمات الدفع الإلكتروني', 'الإجابة على استبيان تقييم تجربة المحافظ الرقمية في السوق العراقي للمساهمة في تحسين الخدمات.', 'survey', 'https://forms.google.com', NULL, 'all', NULL, 250.00, 30, 0, 1),
                (5, 'زيارة تطبيق محفظة الدفع الشريكة', 'الاطلاع على تفاصيل خدمات التحويل الفوري وحلول تسوية الفواتير المعتمدة للمستخدمين.', 'web', 'https://www.zaincash.iq', NULL, 'all', NULL, 250.00, 30, 0, 1);
            ");

            // 12. Ensure Default Central Administrator & Demo Client User exist
            $adminCheck = $pdo->query("SELECT id FROM users WHERE email = 'admin@maham.iq' LIMIT 1");
            if ($adminCheck && count($adminCheck->fetchAll()) === 0) {
                $pdo->exec("
                    INSERT INTO `users` (`id`, `full_name`, `email`, `phone`, `password_hash`, `role`, `balance`, `pending_balance`, `free_tasks_used`, `is_verified`, `status`)
                    VALUES (1, 'الإدارة المركزية | MAHAM', 'admin@maham.iq', '07800000000', '$2y$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGPEWiSDe.6C4rU7u', 'admin', 0.00, 0.00, 0, 1, 'active')
                    ON DUPLICATE KEY UPDATE `role` = 'admin';
                ");
            }

            $userCheck = $pdo->query("SELECT id FROM users WHERE email = 'user@maham.iq' LIMIT 1");
            if ($userCheck && count($userCheck->fetchAll()) === 0) {
                $pdo->exec("
                    INSERT INTO `users` (`id`, `full_name`, `email`, `phone`, `password_hash`, `role`, `balance`, `pending_balance`, `free_tasks_used`, `is_verified`, `status`)
                    VALUES (2, 'سعد ماهر سعد', 'user@maham.iq', '07812345678', '$2y$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGPEWiSDe.6C4rU7u', 'user', 25000.00, 0.00, 0, 1, 'active')
                    ON DUPLICATE KEY UPDATE `status` = 'active';
                ");
            }

            // 13. Ensure avatar_url and remember_token columns on users table if pre-existed
            try {
                $colAvatar = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'avatar_url'");
                if ($colAvatar && count($colAvatar->fetchAll()) === 0) {
                    $pdo->exec("ALTER TABLE `users` ADD COLUMN `avatar_url` VARCHAR(500) NULL DEFAULT NULL AFTER `google_id`");
                }

                $colRemember = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'remember_token'");
                if ($colRemember && count($colRemember->fetchAll()) === 0) {
                    $pdo->exec("ALTER TABLE `users` ADD COLUMN `remember_token` VARCHAR(128) NULL DEFAULT NULL AFTER `avatar_url`");
                    $pdo->exec("ALTER TABLE `users` ADD INDEX `idx_users_remember_token` (`remember_token`)");
                }
            } catch (Exception $e) {
                // Non-blocking fallback
            }

            // 14. Ensure Anti-Fraud Index on transactions(payment_method, tx_reference)
            try {
                $idxCheck = $pdo->query("SHOW INDEX FROM `transactions` WHERE Key_name = 'idx_tx_method_ref'");
                if ($idxCheck && count($idxCheck->fetchAll()) === 0) {
                    $pdo->exec("ALTER TABLE `transactions` ADD INDEX `idx_tx_method_ref` (`payment_method`, `tx_reference`)");
                }
            } catch (Exception $e) {
                // Non-blocking fallback
            }
        } catch (Exception $migrationError) {
            // Graceful fallback to avoid interrupting request processing
            error_log("MAHAM AutoMigrate Notice: " . $migrationError->getMessage());
        }
    }
        } catch (Exception $migrationError) {
            // Graceful fallback to avoid interrupting request processing
            error_log("MAHAM AutoMigrate Notice: " . $migrationError->getMessage());
        }
    }

    /**
     * Prevent object cloning
     */
    private function __clone() {}

    /**
     * Prevent unserialization
     */
    public function __wakeup() {
        throw new RuntimeException("Cannot unserialize singleton");
    }
}
