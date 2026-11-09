<?php
/**
 * MAHAM FinTech Platform - Standardized API Response Formatter
 */

declare(strict_types=1);

class Response {
    /**
     * Send standard JSON response and terminate execution
     */
    public static function json(mixed $data, int $statusCode = 200, array $headers = []): void {
        // Clean any accidental output buffer to prevent corrupted JSON
        if (ob_get_length()) {
            ob_clean();
        }

        http_response_code($statusCode);
        header('Content-Type: application/json; charset=UTF-8');

        foreach ($headers as $key => $val) {
            header("{$key}: {$val}");
        }

        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Success JSON response envelope
     */
    public static function success(string $message = '', mixed $data = [], int $statusCode = 200): void {
        self::json([
            'success'   => true,
            'message'   => $message,
            'data'      => $data,
            'timestamp' => date('c'),
            'csrf_token'=> $_SESSION['csrf_token'] ?? null
        ], $statusCode);
    }

    /**
     * Error JSON response envelope
     */
    public static function error(string $message, int $statusCode = 400, array $errors = []): void {
        self::json([
            'success'   => false,
            'message'   => $message,
            'errors'    => $errors,
            'timestamp' => date('c'),
            'csrf_token'=> $_SESSION['csrf_token'] ?? null
        ], $statusCode);
    }
}

