<?php
/**
 * MAHAM FinTech Platform - Production System Diagnostics & Health Check
 * Verifies PHP 8.2+, PDO MySQL, Storage Writeability & Table Integrity
 */

declare(strict_types=1);

define('MAHAM_SYSTEM', true);

require_once __DIR__ . '/config/app.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/utils/Response.php';

header('Content-Type: application/json; charset=UTF-8');

$diagnostics = [
    'status'       => 'healthy',
    'timestamp'    => date('c'),
    'environment'  => env('APP_ENV', 'production'),
    'php_version'  => PHP_VERSION,
    'checks'       => []
];

$allHealthy = true;

// 1. PHP Version Check (Requires 8.2+)
$isPhpSupported = version_compare(PHP_VERSION, '8.2.0', '>=');
$diagnostics['checks']['php_runtime'] = [
    'required' => '>= 8.2.0',
    'current'  => PHP_VERSION,
    'passed'   => $isPhpSupported
];
if (!$isPhpSupported) $allHealthy = false;

// 2. Required PHP Extensions
$requiredExtensions = ['pdo', 'pdo_mysql', 'mbstring', 'fileinfo', 'json'];
$extensionStatus = [];
foreach ($requiredExtensions as $ext) {
    $isLoaded = extension_loaded($ext);
    $extensionStatus[$ext] = $isLoaded;
    if (!$isLoaded) $allHealthy = false;
}
$diagnostics['checks']['extensions'] = $extensionStatus;

// 3. Writable Storage Check (uploads/receipts)
$uploadsDir = UPLOADS_PATH;
$isDirWritable = is_dir($uploadsDir) && is_writable($uploadsDir);
$diagnostics['checks']['storage_writeable'] = [
    'path'   => 'uploads/receipts',
    'exists' => is_dir($uploadsDir),
    'passed' => $isDirWritable
];
if (!$isDirWritable) $allHealthy = false;

// 4. Database Connection & Schema Tables Check
try {
    $pdo = Database::getConnection();
    
    // Check tables exist
    $tables = ['users', 'packages', 'user_subscriptions', 'tasks', 'task_completions', 'transactions', 'otp_codes', 'app_settings'];
    $existingTables = [];
    
    $stmt = $pdo->query("SHOW TABLES");
    while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
        $existingTables[] = $row[0];
    }
    
    $missingTables = array_diff($tables, $existingTables);
    
    // Query counts
    $usersCount = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    $packagesCount = (int)$pdo->query("SELECT COUNT(*) FROM packages")->fetchColumn();
    $tasksCount = (int)$pdo->query("SELECT COUNT(*) FROM tasks")->fetchColumn();

    $diagnostics['checks']['database'] = [
        'connected'      => true,
        'missing_tables' => array_values($missingTables),
        'tables_passed'  => empty($missingTables),
        'records_count'  => [
            'users'    => $usersCount,
            'packages' => $packagesCount,
            'tasks'    => $tasksCount
        ]
    ];

    if (!empty($missingTables)) {
        $allHealthy = false;
    }
} catch (Throwable $e) {
    $allHealthy = false;
    $diagnostics['checks']['database'] = [
        'connected' => false,
        'error'     => env('APP_DEBUG', false) ? $e->getMessage() : 'تعذر الاتصال بقاعدة البيانات. تأكد من إعدادات .env'
    ];
}

$diagnostics['status'] = $allHealthy ? 'healthy' : 'degraded';
$httpStatusCode = $allHealthy ? 200 : 503;

http_response_code($httpStatusCode);
echo json_encode($diagnostics, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
exit;

