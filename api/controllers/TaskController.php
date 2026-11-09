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
     * Retrieve Available Tasks and User Execution State (listTasks alias)
     */
    public static function listTasks(): void {
        self::getTasks();
    }

    /**
     * Retrieve Available Tasks and User Execution State
     */
    public static function getTasks(): void {
        $user = AuthMiddleware::authenticate();
        $pdo  = Database::getConnection();

        // 1. Fetch active VIP subscriptions (Cumulative Multi-Tier Logic)
        $subStmt = $pdo->prepare("
            SELECT s.id, s.package_id, s.daily_profit_rate, p.name as package_name, p.code as package_code
            FROM user_subscriptions s
            JOIN packages p ON s.package_id = p.id
            WHERE s.user_id = :user_id AND s.status = 'active' AND s.expires_at > NOW()
            ORDER BY p.price DESC
        ");
        $subStmt->execute(['user_id' => $user['id']]);
        $activeSubs = $subStmt->fetchAll();

        $activeSubsCount = count($activeSubs);
        $isVip = ($activeSubsCount > 0);

        $vipDailySum = 0.0;
        foreach ($activeSubs as $s) {
            $vipDailySum += (float)$s['daily_profit_rate'];
        }

        // Cumulative Reward Rate: Base 250 IQD + sum of active VIP tiers
        $taskRewardRate = $isVip ? (250.0 + $vipDailySum) : 250.0;

        // 2. Compute 24-Hour Cooldown (Applies to both Free and VIP)
        $freeLimit = 5;
        $freeUsed  = (int)$user['free_tasks_used'];
        $freeRemaining = max(0, $freeLimit - $freeUsed);

        $cooldownRemainingSeconds = 0;
        $nextAvailableAt = null;

        if (!empty($user['last_task_completed_at'])) {
            $lastCompletedTimestamp = strtotime($user['last_task_completed_at']);
            $requiredCooldownSeconds = 24 * 3600; // Strict 24 hours
            $elapsedSeconds = time() - $lastCompletedTimestamp;

            if ($elapsedSeconds < $requiredCooldownSeconds) {
                $cooldownRemainingSeconds = $requiredCooldownSeconds - $elapsedSeconds;
                $nextAvailableAt = date('Y-m-d H:i:s', $lastCompletedTimestamp + $requiredCooldownSeconds);
            }
        }

        // Execution readiness check
        if ($isVip) {
            $canExecute = ($cooldownRemainingSeconds === 0);
        } else {
            $canExecute = ($freeRemaining > 0 && $cooldownRemainingSeconds === 0);
        }

        // 3. Fetch active tasks catalog (Strict isolation: All public tasks + tasks specific to this authenticated user only)
        $taskStmt = $pdo->prepare("
            SELECT id, title, description, category, target_url, attachment_url, target_type, target_user_id, reward_amount, required_seconds, min_vip_level
            FROM tasks
            WHERE is_active = 1
              AND (target_type = 'all' OR (target_type = 'specific' AND target_user_id = :user_id))
            ORDER BY id DESC
        ");
        $taskStmt->execute(['user_id' => $user['id']]);
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
                'active_subscriptions_count' => $activeSubsCount,
                'active_package'             => $isVip ? ($activeSubs[0]['package_name'] . ($activeSubsCount > 1 ? " (+{$activeSubsCount} باقات)" : '')) : 'الباقة الأساسية المجانية',
                'current_reward_per_task'    => $taskRewardRate,
                'free_tasks_used'            => $freeUsed,
                'free_tasks_remaining'       => $isVip ? '∞' : $freeRemaining,
                'tasks_display'              => $isVip ? '∞' : (string)$freeRemaining,
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

        // Fetch active VIP subscriptions (Cumulative)
        $subStmt = $pdo->prepare("
            SELECT s.package_id, s.daily_profit_rate
            FROM user_subscriptions s
            WHERE s.user_id = :user_id AND s.status = 'active' AND s.expires_at > NOW()
        ");
        $subStmt->execute(['user_id' => $user['id']]);
        $activeSubs = $subStmt->fetchAll();
        $isVip = count($activeSubs) > 0;

        // Check 24-Hour Cooldown for All Users
        if (!empty($user['last_task_completed_at'])) {
            $elapsed = time() - strtotime($user['last_task_completed_at']);
            $cooldown = 24 * 3600;
            if ($elapsed < $cooldown) {
                $remaining = $cooldown - $elapsed;
                $hours = floor($remaining / 3600);
                $minutes = floor(($remaining % 3600) / 60);
                Response::error("نظام التبريد نشط! يمكنك إنجاز المهمة القادمة بعد {$hours} ساعة و {$minutes} دقيقة.", 422, [
                    'cooldown_remaining_seconds' => $remaining
                ]);
            }
        }

        // Enforce Free Tier Quota (5 tasks maximum)
        if (!$isVip && (int)$user['free_tasks_used'] >= 5) {
            Response::error('لقد استنفدت كامل حصة المهام المجانية (5 مهام). يرجى الاشتراك في إحدى باقات VIP لمتابعة الأرباح.', 422);
        }

        // Calculate Cumulative Reward Amount
        $vipDailySum = 0.0;
        foreach ($activeSubs as $s) {
            $vipDailySum += (float)$s['daily_profit_rate'];
        }
        $rewardAmount = $isVip ? (250.0 + $vipDailySum) : 250.0;

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
            'package_id'       => $isVip ? (int)$activeSubs[0]['package_id'] : null,
            'reward_amount'    => $rewardAmount,
            'is_vip'           => $isVip
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

        $taskId    = (int)$activeSessionTask['task_id'];
        $packageId = $activeSessionTask['package_id'];

        $pdo = Database::getConnection();

        // 2. Atomic Database Transaction with Row Locking (FOR UPDATE)
        $pdo->beginTransaction();
        try {
            // Lock user row against race conditions
            $userLockStmt = $pdo->prepare("SELECT id, balance, free_tasks_used, last_task_completed_at FROM users WHERE id = :id FOR UPDATE");
            $userLockStmt->execute(['id' => $user['id']]);
            $lockedUser = $userLockStmt->fetch();

            if (!$lockedUser) {
                throw new RuntimeException("المستخدم غير موجود.");
            }

            // Check 24h Cooldown for All Users inside the atomic lock
            if (!empty($lockedUser['last_task_completed_at'])) {
                $cooldownElapsed = time() - strtotime($lockedUser['last_task_completed_at']);
                $requiredCooldown = 24 * 3600;
                if ($cooldownElapsed < $requiredCooldown) {
                    $remainingSec = $requiredCooldown - $cooldownElapsed;
                    $remainingMin = ceil($remainingSec / 60);
                    throw new RuntimeException("نظام التبريد نشط في الوقت الحالي! يتبقى {$remainingMin} دقيقة حتى موعد المهمة التالية.");
                }
            }

            // Fetch active user subscriptions for exact cumulative reward calculation
            $subStmt = $pdo->prepare("
                SELECT package_id, daily_profit_rate
                FROM user_subscriptions 
                WHERE user_id = :user_id AND status = 'active' AND expires_at > NOW() 
            ");
            $subStmt->execute(['user_id' => $user['id']]);
            $activeSubs = $subStmt->fetchAll();
            $isVip = count($activeSubs) > 0;

            // Enforce free tier limits inside the lock
            if (!$isVip && (int)$lockedUser['free_tasks_used'] >= 5) {
                throw new RuntimeException("تم استنفاد جميع المهام المجانية المتاحة لهذا الحساب. يرجى الاشتراك في إحدى باقات VIP.");
            }

            // Calculate Cumulative Reward Amount
            $vipDailySum = 0.0;
            foreach ($activeSubs as $s) {
                $vipDailySum += (float)$s['daily_profit_rate'];
            }
            $rewardAmount = $isVip ? (250.0 + $vipDailySum) : 250.0;

            $currentBalance = (float)$lockedUser['balance'];
            $newBalance     = $currentBalance + $rewardAmount;

            // Record task completion in audit log
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

            // Record double-entry financial transaction in ledger
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

            // Update user balance & 24h cooldown timer
            if (!$isVip) {
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

            // Clear session task state
            unset($_SESSION['active_task']);

            $newFreeUsed = (int)$lockedUser['free_tasks_used'] + 1;

            Response::success('تهانينا! تم استلام أرباح المهمة بنجاح وإضافتها إلى رصيدك.', [
                'reward_earned'              => $rewardAmount,
                'new_balance'                => $newBalance,
                'cooldown_remaining_seconds' => 24 * 3600,
                'tasks_remaining'            => $isVip ? '∞' : max(0, 5 - $newFreeUsed),
                'tasks_display'              => $isVip ? '∞' : (string)max(0, 5 - $newFreeUsed),
                'is_ready'                   => false
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log("MAHAM Claim Task Error: " . $e->getMessage());
            Response::error($e->getMessage() ?: 'فشلت معالجة إضافة المكافأة. يرجى المحاولة مرة أخرى.', 400);
        }
    }
}

