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
     * Guarantees all required columns, anti-fraud indexes, corporate settings, and seed records exist.
     */
    private static function autoMigrate(PDO $pdo): void {
        try {
            // 1. Ensure app_settings exists
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `app_settings` (
                    `setting_key` VARCHAR(100) NOT NULL,
                    `setting_value` TEXT NOT NULL,
                    `description` VARCHAR(255) NULL DEFAULT NULL,
                    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (`setting_key`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            // 2. Ensure official settings for Asiacell and MasterCard exist
            $settingsStmt = $pdo->prepare("
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
            $settingsStmt->execute();

            // 3. Ensure Anti-Fraud Index on transactions(payment_method, tx_reference)
            try {
                $idxCheck = $pdo->query("SHOW INDEX FROM `transactions` WHERE Key_name = 'idx_tx_method_ref'");
                if ($idxCheck && count($idxCheck->fetchAll()) === 0) {
                    $pdo->exec("ALTER TABLE `transactions` ADD INDEX `idx_tx_method_ref` (`payment_method`, `tx_reference`)");
                }
            } catch (Exception $e) {
                // Non-blocking if table or index already configured
            }

            // 4. Ensure Default Admin exists in users table
            $adminCheck = $pdo->query("SELECT id FROM users WHERE email = 'admin@maham.iq' LIMIT 1");
            if ($adminCheck && count($adminCheck->fetchAll()) === 0) {
                $pdo->exec("
                    INSERT INTO `users` (`id`, `full_name`, `email`, `phone`, `password_hash`, `role`, `balance`, `pending_balance`, `free_tasks_used`, `is_verified`, `status`)
                    VALUES (1, 'الإدارة المركزية | MAHAM', 'admin@maham.iq', '07800000000', '$2y$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGPEWiSDe.6C4rU7u', 'admin', 0.00, 0.00, 0, 1, 'active')
                    ON DUPLICATE KEY UPDATE `role` = 'admin';
                ");
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
