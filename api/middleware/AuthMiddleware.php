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
     * Authenticate active user session
     */
    public static function authenticate(): array {
        $userId = $_SESSION['user_id'] ?? null;

        if (!$userId) {
            Response::error('يرجى تسجيل الدخول للوصول إلى هذه الخدمة.', 401);
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT id, full_name, email, phone, role, balance, pending_balance, free_tasks_used, last_task_completed_at, is_verified, status FROM users WHERE id = :id LIMIT 1");
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
