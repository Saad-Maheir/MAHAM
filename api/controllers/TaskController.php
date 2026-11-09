<?php
/**
 * MAHAM FinTech Platform - 24-Hour Cooldown & Anti-Cheat Task Engine
 * Atomic execution, server-side timestamp validation, and anti-fraud safeguards
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

class TaskController {
    /**
     * Retrieve Available Tasks and User Execution State
     */
    public static function getTasks(): void {
        $user = AuthMiddleware::authenticate();
        $pdo  = Database::getConnection();

        // 1. Check active VIP subscriptions
        $subStmt = $pdo->prepare("
            SELECT s.id, s.package_id, s.daily_profit_rate, p.name as package_name, p.code as package_code
            FROM user_subscriptions s
            JOIN packages p ON s.package_id = p.id
            WHERE s.user_id = :user_id AND s.status = 'active' AND s.expires_at > NOW()
            ORDER BY p.price DESC
            LIMIT 1
        ");
        $subStmt->execute(['user_id' => $user['id']]);
        $activeSub = $subStmt->fetch();

        $isVip = ($activeSub !== false);

        // 2. Compute 24-Hour Cooldown and Task Quota for Free Tier
        $freeLimit = 5;
        $freeUsed  = (int)$user['free_tasks_used'];
        $freeRemaining = max(0, $freeLimit - $freeUsed);

        $cooldownRemainingSeconds = 0;
        $nextAvailableAt = null;

        if (!$isVip && $user['last_task_completed_at'] !== null) {
            $lastCompletedTimestamp = strtotime($user['last_task_completed_at']);
            $requiredCooldownSeconds = 24 * 3600; // Strict 24 hours
            $elapsedSeconds = time() - $lastCompletedTimestamp;

            if ($elapsedSeconds < $requiredCooldownSeconds) {
                $cooldownRemainingSeconds = $requiredCooldownSeconds - $elapsedSeconds;
                $nextAvailableAt = date('Y-m-d H:i:s', $lastCompletedTimestamp + $requiredCooldownSeconds);
            }
        }

        $canExecute = $isVip ? true : ($freeRemaining > 0 && $cooldownRemainingSeconds === 0);

        // 3. Fetch active tasks catalog
        $taskStmt = $pdo->prepare("
            SELECT id, title, description, category, target_url, reward_amount, required_seconds, min_vip_level
            FROM tasks
            WHERE is_active = 1
            ORDER BY id ASC
        ");
        $taskStmt->execute();
        $tasks = $taskStmt->fetchAll();

        // 4. Fetch tasks completed by user today to display progress
        $todayStart = date('Y-m-d 00:00:00');
        $compStmt = $pdo->prepare("
            SELECT task_id, completed_at, reward_earned
            FROM task_completions
            WHERE user_id = :user_id AND completed_at >= :today_start
        ");
        $compStmt->execute(['user_id' => $user['id'], 'today_start' => $todayStart]);
        $todayCompletions = $compStmt->fetchAll();
        $completedTaskIdsToday = array_column($todayCompletions, 'task_id');

        Response::success('تم جلب قائمة المهام بنجاح.', [
            'tasks' => $tasks,
            'user_state' => [
                'is_vip'                     => $isVip,
                'active_package'             => $activeSub ? $activeSub['package_name'] : 'الباقة الأساسية المجانية',
                'current_reward_per_task'    => $isVip ? (float)$activeSub['daily_profit_rate'] : 250.00,
                'free_tasks_used'            => $freeUsed,
                'free_tasks_remaining'       => $freeRemaining,
                'cooldown_remaining_seconds' => $cooldownRemainingSeconds,
                'next_available_at'          => $nextAvailableAt,
                'can_execute_task'           => $canExecute,
                'completed_task_ids_today'   => $completedTaskIdsToday
            ]
        ]);
    }

    /**
     * Start a Task - Initializes Anti-Cheat Server Timer & Cryptographic Nonce
     */
    public static function startTask(): void {
        $user   = AuthMiddleware::authenticate();
        $taskId = (int)($_POST['task_id'] ?? 0);

        if ($taskId <= 0) {
            Response::error('معرف المهمة غير صالح.');
        }

        $pdo = Database::getConnection();

        // Verify Task Exists
        $taskStmt = $pdo->prepare("SELECT id, title, description, target_url, reward_amount, required_seconds, min_vip_level FROM tasks WHERE id = :id AND is_active = 1 LIMIT 1");
        $taskStmt->execute(['id' => $taskId]);
        $task = $taskStmt->fetch();

        if (!$task) {
            Response::error('المهمة المطلوبة غير متوفرة حالياً.');
        }

        // Check active VIP subscription
        $subStmt = $pdo->prepare("
            SELECT s.id, s.package_id, s.daily_profit_rate, p.name as package_name
            FROM user_subscriptions s
            JOIN packages p ON s.package_id = p.id
            WHERE s.user_id = :user_id AND s.status = 'active' AND s.expires_at > NOW()
            LIMIT 1
        ");
        $subStmt->execute(['user_id' => $user['id']]);
        $activeSub = $subStmt->fetch();
        $isVip = ($activeSub !== false);

        // Enforce Free Tier Constraints
        if (!$isVip) {
            if ((int)$user['free_tasks_used'] >= 5) {
                Response::error('لقد استنفذت كامل حصة المهام المجانية (5 مهام). يرجى الترقية إلى إحدى باقات VIP لمتابعة الأرباح.');
            }

            if ($user['last_task_completed_at'] !== null) {
                $elapsed = time() - strtotime($user['last_task_completed_at']);
                $cooldown = 24 * 3600;
                if ($elapsed < $cooldown) {
                    $remaining = $cooldown - $elapsed;
                    $hours = floor($remaining / 3600);
                    $minutes = floor(($remaining % 3600) / 60);
                    Response::error("نظام التبريد نشط. يمكنك إنجاز المهمة القادمة بعد {$hours} ساعة و {$minutes} دقيقة.");
                }
            }
        }

        // Generate Cryptographic Verification Token
        $verificationToken = bin2hex(random_bytes(32));
        $requiredSeconds = (int)$task['required_seconds'];
        if ($requiredSeconds < 30) {
            $requiredSeconds = 30; // Strict minimum 30s anti-cheat
        }

        // Store active session state
        $_SESSION['active_task'] = [
            'task_id'          => $task['id'],
            'token'            => $verificationToken,
            'started_at'       => time(),
            'required_seconds' => $requiredSeconds,
            'package_id'       => $isVip ? (int)$activeSub['package_id'] : null,
            'reward_amount'    => $isVip ? (float)$activeSub['daily_profit_rate'] : (float)$task['reward_amount']
        ];

        Response::success('تم بدء المهمة وتفعيل عداد التحقق الأمني بنجاح.', [
            'task_id'          => (int)$task['id'],
            'title'            => $task['title'],
            'target_url'       => $task['target_url'],
            'required_seconds' => $requiredSeconds,
            'token'            => $verificationToken
        ]);
    }

    /**
     * Claim Task Reward - Server-Side Anti-Cheat & Atomic Balance Update
     */
    public static function claimReward(): void {
        $user  = AuthMiddleware::authenticate();
        $token = trim((string)($_POST['token'] ?? ''));

        // 1. Anti-Cheat Verification Check
        $activeSessionTask = $_SESSION['active_task'] ?? null;
        if (!$activeSessionTask || empty($token)) {
            Response::error('جلسة المهمة غير صالحة أو تم إنهاؤها مسبقاً. يرجى إعادة بدء المهمة.');
        }

        if (!hash_equals($activeSessionTask['token'], $token)) {
            Response::error('فشل التحقق الأمني من صحة رمز المهمة (Anti-Cheat Token Mismatch).');
        }

        // Enforce Server-Side Time Duration (Strict 30 seconds)
        $elapsedTime = time() - (int)$activeSessionTask['started_at'];
        $requiredTime = (int)$activeSessionTask['required_seconds'];

        if ($elapsedTime < $requiredTime) {
            $remaining = $requiredTime - $elapsedTime;
            Response::error("لم تنتهِ مدة التحقق الأمنية بعد! يرجى الانتظار {$remaining} ثانية إضافية قبل تأكيد الربح.", 422);
        }

        $taskId       = (int)$activeSessionTask['task_id'];
        $rewardAmount = (float)$activeSessionTask['reward_amount'];
        $packageId    = $activeSessionTask['package_id'];

        $pdo = Database::getConnection();

        // 2. Atomic Database Transaction with Row Locking (FOR UPDATE)
        $pdo->beginTransaction();
        try {
            // Lock user row against race condition (double clicking claim)
            $userLockStmt = $pdo->prepare("SELECT id, balance, free_tasks_used, last_task_completed_at FROM users WHERE id = :id FOR UPDATE");
            $userLockStmt->execute(['id' => $user['id']]);
            $lockedUser = $userLockStmt->fetch();

            if (!$lockedUser) {
                throw new RuntimeException("المستخدم غير موجود.");
            }

            // Check if user is VIP
            $subStmt = $pdo->prepare("
                SELECT id FROM user_subscriptions 
                WHERE user_id = :user_id AND status = 'active' AND expires_at > NOW() 
                LIMIT 1
            ");
            $subStmt->execute(['user_id' => $user['id']]);
            $hasVip = ($subStmt->fetch() !== false);

            // Re-verify 24h Cooldown for Free Tier inside the atomic lock
            if (!$hasVip) {
                if ((int)$lockedUser['free_tasks_used'] >= 5) {
                    throw new RuntimeException("تم استنفاد جميع المهام المجانية المتاحة لهذا الحساب.");
                }

                if ($lockedUser['last_task_completed_at'] !== null) {
                    $cooldownElapsed = time() - strtotime($lockedUser['last_task_completed_at']);
                    if ($cooldownElapsed < (24 * 3600)) {
                        throw new RuntimeException("نظام التبريد نشط في الوقت الحالي.");
                    }
                }
            }

            $currentBalance = (float)$lockedUser['balance'];
            $newBalance     = $currentBalance + $rewardAmount;

            // Record task completion
            $compStmt = $pdo->prepare("
                INSERT INTO task_completions (user_id, task_id, package_id, reward_earned, started_at, completed_at, duration_seconds, verification_token, status)
                VALUES (:user_id, :task_id, :package_id, :reward, :started_at, NOW(), :duration, :token, 'verified')
            ");
            $compStmt->execute([
                'user_id'    => $user['id'],
                'task_id'    => $taskId,
                'package_id' => $packageId,
                'reward'     => $rewardAmount,
                'started_at' => date('Y-m-d H:i:s', $activeSessionTask['started_at']),
                'duration'   => $elapsedTime,
                'token'      => $token
            ]);

            // Record financial transaction
            $txUuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000,
                mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );

            $txStmt = $pdo->prepare("
                INSERT INTO transactions (tx_uuid, user_id, type, amount, balance_before, balance_after, payment_method, status, admin_notes)
                VALUES (:tx_uuid, :user_id, 'task_reward', :amount, :before, :after, 'wallet_balance', 'approved', 'مكافأة إنجاز مهمة يومية')
            ");
            $txStmt->execute([
                'tx_uuid' => $txUuid,
                'user_id' => $user['id'],
                'amount'  => $rewardAmount,
                'before'  => $currentBalance,
                'after'   => $newBalance
            ]);

            // Update user balance & cooldown records
            if (!$hasVip) {
                $updUser = $pdo->prepare("
                    UPDATE users 
                    SET balance = :new_balance, 
                        free_tasks_used = free_tasks_used + 1, 
                        last_task_completed_at = NOW() 
                    WHERE id = :id
                ");
                $updUser->execute([
                    'new_balance' => $newBalance,
                    'id'          => $user['id']
                ]);
            } else {
                $updUser = $pdo->prepare("
                    UPDATE users 
                    SET balance = :new_balance, 
                        last_task_completed_at = NOW() 
                    WHERE id = :id
                ");
                $updUser->execute([
                    'new_balance' => $newBalance,
                    'id'          => $user['id']
                ]);
            }

            $pdo->commit();

            // Clear session state
            unset($_SESSION['active_task']);

            Response::success('تهانينا! تم التحقق من إنجاز المهمة بنجاح وإضافة الربح إلى محفظتك.', [
                'reward_earned'              => $rewardAmount,
                'new_balance'                => $newBalance,
                'cooldown_remaining_seconds' => $hasVip ? 0 : (24 * 3600),
                'tasks_remaining'            => $hasVip ? '∞' : max(0, 5 - ((int)$lockedUser['free_tasks_used'] + 1))
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log("MAHAM Claim Task Error: " . $e->getMessage());
            Response::error($e->getMessage() ?: 'فشلت معالجة إضافة المكافأة. يرجى المحاولة مرة أخرى.', 400);
        }
    }
}
