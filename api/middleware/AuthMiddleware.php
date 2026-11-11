<?php
/**
 * MAHAM FinTech Platform - Authentication Middleware
 * Validates active session state and account verification status
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/Response.php';

class AuthMiddleware {
    /**
     * Authenticate active user session with 30-day token auto-recovery
     */
    public static function authenticate(): array {
        $userId = $_SESSION['user_id'] ?? null;

        // Auto-recover session from 30-Day Remember Token or Bearer Authorization header
        if (!$userId) {
            $token = null;
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
            if (empty($authHeader) && function_exists('getallheaders')) {
                $allHeaders = getallheaders();
                $authHeader = $allHeaders['Authorization'] ?? $allHeaders['authorization'] ?? '';
            }
            if (empty($authHeader) && function_exists('apache_request_headers')) {
                $apacheHeaders = apache_request_headers();
                $authHeader = $apacheHeaders['Authorization'] ?? $apacheHeaders['authorization'] ?? '';
            }
            if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
                $token = $matches[1];
            } elseif (!empty($_COOKIE['maham_remember'])) {
                $token = (string)$_COOKIE['maham_remember'];
            }

            if (!empty($token) && strlen($token) >= 32) {
                try {
                    $pdo = Database::getConnection();
                    $tokenStmt = $pdo->prepare("SELECT id, role, status FROM users WHERE remember_token = :token LIMIT 1");
                    $tokenStmt->execute(['token' => $token]);
                    $tokenUser = $tokenStmt->fetch();

                    if ($tokenUser && $tokenUser['status'] === 'active') {
                        $_SESSION['user_id'] = (int)$tokenUser['id'];
                        $_SESSION['role']    = $tokenUser['role'];
                        $userId = (int)$tokenUser['id'];
                    }
                } catch (Exception $e) {
                    // Token inspection non-blocking error fallback
                }
            }
        }

        if (!$userId) {
            Response::error('يرجى تسجيل الدخول للوصول إلى هذه الخدمة.', 401);
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            SELECT id, full_name, email, phone, role, avatar_url, balance, pending_balance, 
                   free_tasks_used, last_task_completed_at, is_verified, status 
            FROM users 
            WHERE id = :id 
            LIMIT 1
        ");
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch();

        if (!$user) {
            unset($_SESSION['user_id']);
            Response::error('الحساب غير موجود أو تم إيقافه.', 401);
        }

        if ($user['status'] !== 'active') {
            unset($_SESSION['user_id']);
            Response::error('تم تعليق هذا الحساب من قِبل إدارة الأمان.', 403);
        }

        return $user;
    }

    /**
     * Require administrative privilege (Ready for Phase 2 Command Center)
     */
    public static function requireAdmin(): array {
        $user = self::authenticate();
        if ($user['role'] !== 'admin') {
            Response::error('عذراً، لا تملك الصلاحيات الإدارية الكافية للوصول.', 403);
        }
        return $user;
    }
}

