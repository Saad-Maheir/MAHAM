<?php
/**
 * MAHAM FinTech Platform - CSRF Verification Middleware
 * Protects state-changing operations from Cross-Site Request Forgery
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';

class CsrfMiddleware {
    /**
     * Enforce CSRF check on mutating HTTP methods
     */
    public static function handle(): void {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

        if (in_array(strtoupper($method), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            if (!Validator::verifyCsrf()) {
                Response::error('رمز الأمان غير صالح أو منتهي الصلاحية (CSRF). يرجى تحديث الصفحة والمحاولة مجدداً.', 403);
            }
        }
    }
}
