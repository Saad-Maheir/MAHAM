<?php
/**
 * MAHAM FinTech Platform - API Front Controller & REST Router
 * Multi-route dispatcher supporting clean URLs, PATH_INFO, and query param fallbacks
 */

declare(strict_types=1);

define('MAHAM_SYSTEM', true);

require_once __DIR__ . '/config/app.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/utils/Response.php';
require_once __DIR__ . '/utils/Validator.php';
require_once __DIR__ . '/middleware/CsrfMiddleware.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/TaskController.php';
require_once __DIR__ . '/controllers/WalletController.php';
require_once __DIR__ . '/controllers/SubscriptionController.php';
require_once __DIR__ . '/controllers/AdminController.php';

// Handle CORS Pre-flight Options Request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token, X-Requested-With');
    exit;
}

// Support JSON payload parsing for POST requests
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
if (str_contains($contentType, 'application/json')) {
    $rawInput = file_get_contents('php://input');
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $_POST = array_merge($_POST, $decoded);
    }
}

// Resolve endpoint path (Supports ?route=, ?endpoint=, PATH_INFO, and clean URL rewrites)
$endpoint = '';

if (!empty($_GET['route'])) {
    $endpoint = trim((string)$_GET['route'], '/');
} elseif (!empty($_GET['endpoint'])) {
    $endpoint = trim((string)$_GET['endpoint'], '/');
} elseif (isset($_SERVER['PATH_INFO'])) {
    $endpoint = trim((string)$_SERVER['PATH_INFO'], '/');
} else {
    $requestUri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    // Strip leading directory paths
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    $scriptDir  = dirname($scriptName);

    if (str_starts_with($requestUri, $scriptName)) {
        $endpoint = substr($requestUri, strlen($scriptName));
    } elseif ($scriptDir !== '/' && str_starts_with($requestUri, $scriptDir)) {
        $endpoint = substr($requestUri, strlen($scriptDir));
    } else {
        $endpoint = $requestUri;
    }

    // Strip '/api' prefix if present
    $endpoint = preg_replace('#^/?(api/?)?#', '', $endpoint);
    $endpoint = trim((string)$endpoint, '/');
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// Route Registry
try {
    switch ($endpoint) {
        // Public CSRF Token Endpoint
        case 'csrf-token':
            if ($method === 'GET') {
                Response::success('CSRF Token Retrieved', ['csrf_token' => $_SESSION['csrf_token']]);
            }
            break;

        // Authentication & Profile Endpoints
        case 'auth/register':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AuthController::register();
            }
            break;

        case 'auth/login':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AuthController::login();
            }
            break;

        case 'auth/google':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AuthController::googleLogin();
            }
            break;

        case 'auth/verify-otp':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AuthController::verifyOtp();
            }
            break;

        case 'auth/resend-otp':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AuthController::resendOtp();
            }
            break;

        case 'auth/me':
            if ($method === 'GET') {
                AuthController::me();
            }
            break;

        case 'auth/logout':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AuthController::logout();
            }
            break;

        // Task & Cooldown Engine Endpoints
        case 'tasks/list':
            if ($method === 'GET') {
                TaskController::getTasks();
            }
            break;

        case 'tasks/start':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                TaskController::startTask();
            }
            break;

        case 'tasks/claim':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                TaskController::claimReward();
            }
            break;

        // Wallet & Accounting Endpoints
        case 'wallet/balance':
            if ($method === 'GET') {
                WalletController::getBalance();
            }
            break;

        case 'wallet/deposit':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                WalletController::deposit();
            }
            break;

        case 'wallet/withdraw':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                WalletController::withdraw();
            }
            break;

        case 'wallet/transactions':
            if ($method === 'GET') {
                WalletController::getTransactions();
            }
            break;

        case 'notifications/list':
            if ($method === 'GET') {
                WalletController::getNotifications();
            }
            break;

        // VIP Subscriptions Endpoints
        case 'subscriptions/list':
            if ($method === 'GET') {
                SubscriptionController::getPackages();
            }
            break;

        case 'subscriptions/subscribe':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                SubscriptionController::subscribe();
            }
            break;

        // Phase 2: Admin Command Center Endpoints
        case 'admin/stats':
            if ($method === 'GET') {
                AdminController::getStats();
            }
            break;

        case 'admin/deposits':
            if ($method === 'GET') {
                AdminController::getDeposits();
            }
            break;

        case 'admin/deposits/approve':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AdminController::approveDeposit();
            }
            break;

        case 'admin/deposits/reject':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AdminController::rejectDeposit();
            }
            break;

        case 'admin/withdrawals':
            if ($method === 'GET') {
                AdminController::getWithdrawals();
            }
            break;

        case 'admin/withdrawals/approve':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AdminController::approveWithdrawal();
            }
            break;

        case 'admin/withdrawals/reject':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AdminController::rejectWithdrawal();
            }
            break;

        case 'admin/tasks':
            if ($method === 'GET') {
                AdminController::getTasks();
            }
            break;

        case 'admin/tasks/create':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AdminController::createTask();
            }
            break;

        case 'admin/tasks/update':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AdminController::updateTask();
            }
            break;

        case 'admin/users':
            if ($method === 'GET') {
                AdminController::getUsers();
            }
            break;

        case 'admin/users/toggle-status':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AdminController::toggleUserStatus();
            }
            break;

        case 'admin/users/adjust-balance':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AdminController::adjustUserBalance();
            }
            break;

        case 'admin/settings':
            if ($method === 'GET') {
                AdminController::getSettings();
            }
            break;

        case 'admin/settings/update':
            if ($method === 'POST') {
                CsrfMiddleware::handle();
                AdminController::updateSettings();
            }
            break;

        default:
            Response::error('المسار المطلوب غير موجود في النظام.', 404, ['endpoint' => $endpoint]);
            break;
    }

    // Method not allowed fallback
    Response::error('طريقة الطلب غير مسموح بها لهذا المسار.', 405);
} catch (Throwable $e) {
    error_log("MAHAM Unhandled API Exception: " . $e->getMessage() . "\n" . $e->getTraceAsString());
    Response::error(
        env('APP_DEBUG', false) ? $e->getMessage() : 'حدث خطأ داخلي في الخادم. يرجى المحاولة لاحقاً.',
        500
    );
}

