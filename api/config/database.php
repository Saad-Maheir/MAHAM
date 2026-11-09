<?php
/**
 * MAHAM FinTech Platform - Database Connection Manager (PDO Singleton)
 * Secure, prepared-statement enforced database layer
 */

declare(strict_types=1);

class Database {
    private static ?PDO $instance = null;

    /**
     * Private constructor to enforce Singleton pattern
     */
    private function __construct() {}

    /**
     * Retrieve active PDO connection instance
     */
    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $host    = env('DB_HOST', 'localhost');
            $port    = env('DB_PORT', 3306);
            $dbName  = env('DB_NAME', 'maham_db');
            $charset = env('DB_CHARSET', 'utf8mb4');
            $user    = env('DB_USER', 'root');
            $pass    = env('DB_PASS', '');

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
                // Log exception internally without exposing credentials to client
                error_log("MAHAM Database Connection Failure: " . $e->getMessage());
                
                if (env('APP_DEBUG', false)) {
                    throw new RuntimeException("Database Connection Error: " . $e->getMessage());
                }
                
                throw new RuntimeException("تعذر الاتصال بقاعدة البيانات. يرجى مراجعة إعدادات الخادم.");
            }
        }

        return self::$instance;
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
