<?php
/**
 * MAHAM FinTech Platform - Admin Command Center Controller (Phase 2)
 * Executive Analytics, Deposit/Withdrawal Approval Workflows, Task & User Management
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

class AdminController {
    /**
     * Get Executive Platform Statistics & Metrics (stats alias)
     */
    public static function stats(): void {
        self::getStats();
    }

    /**
     * Get Executive Platform Statistics & Metrics
     */
    public static function getStats(): void {
        $admin = AuthMiddleware::requireAdmin();
        $pdo   = Database::getConnection();

        // 1. User Metrics
        $userMetricsStmt = $pdo->query("
            SELECT 
                COUNT(*) as total_users,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_users,
                SUM(balance) as total_users_balance,
                SUM(pending_balance) as total_held_withdrawals
            FROM users 
            WHERE role = 'user'
        ");
        $userMetrics = $userMetricsStmt->fetch();

        // 2. Tasks Executed Today
        $todayTasksStmt = $pdo->query("
            SELECT 
                COUNT(*) as completed_today,
                COALESCE(SUM(reward_earned), 0) as rewards_paid_today
            FROM task_completions 
            WHERE completed_at >= CURDATE()
        ");
        $todayTasks = $todayTasksStmt->fetch();

        // 3. Financial Flow Metrics (Deposits & Withdrawals)
        $financeStmt = $pdo->query("
            SELECT 
                COALESCE(SUM(CASE WHEN type = 'deposit' AND status = 'approved' THEN amount ELSE 0 END), 0) as total_approved_deposits,
                COALESCE(SUM(CASE WHEN type = 'withdraw' AND status = 'approved' THEN amount ELSE 0 END), 0) as total_approved_withdrawals,
                COALESCE(SUM(CASE WHEN type = 'subscription_fee' AND status = 'approved' THEN amount ELSE 0 END), 0) as total_subscription_revenue,
                SUM(CASE WHEN type = 'deposit' AND status = 'pending' THEN 1 ELSE 0 END) as pending_deposits_count,
                SUM(CASE WHEN type = 'withdraw' AND status = 'pending' THEN 1 ELSE 0 END) as pending_withdrawals_count
            FROM transactions
        ");
        $finance = $financeStmt->fetch();

        // 4. Active VIP Subscriptions Count
        $vipStmt = $pdo->query("
            SELECT COUNT(*) as active_vip_count
            FROM user_subscriptions
            WHERE status = 'active' AND expires_at > NOW()
        ");
        $vipCount = (int)$vipStmt->fetchColumn();

        Response::success('تم جلب الإحصائيات المركزية بنجاح.', [
            'users' => [
                'total'               => (int)$userMetrics['total_users'],
                'active'              => (int)$userMetrics['active_users'],
                'total_system_balance'=> (float)$userMetrics['total_users_balance'],
                'total_held_payouts'  => (float)$userMetrics['total_held_withdrawals']
            ],
            'tasks' => [
                'completed_today'     => (int)$todayTasks['completed_today'],
                'rewards_paid_today'  => (float)$todayTasks['rewards_paid_today']
            ],
            'financials' => [
                'total_deposits'      => (float)$finance['total_approved_deposits'],
                'total_withdrawals'   => (float)$finance['total_approved_withdrawals'],
                'subscription_revenue'=> (float)$finance['total_subscription_revenue'],
                'pending_deposits'    => (int)$finance['pending_deposits_count'],
                'pending_withdrawals' => (int)$finance['pending_withdrawals_count']
            ],
            'vip' => [
                'active_subscriptions'=> $vipCount
            ]
        ]);
    }

    /**
     * Get Deposits Queue (Pending, Approved, Rejected)
     */
    public static function getDeposits(): void {
        $admin  = AuthMiddleware::requireAdmin();
        $status = Validator::sanitize($_GET['status'] ?? 'pending');
        $pdo    = Database::getConnection();

        $query = "
            SELECT 
                t.id, t.tx_uuid, t.user_id, t.amount, t.payment_method,
                t.sender_account, t.tx_reference, t.receipt_image, t.status,
                t.admin_notes, t.created_at, t.reviewed_at,
                u.full_name as user_name, u.email as user_email, u.phone as user_phone, u.balance as user_current_balance
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE t.type = 'deposit'
        ";

        $params = [];
        if (in_array($status, ['pending', 'approved', 'rejected'], true)) {
            $query .= " AND t.status = :status";
            $params['status'] = $status;
        }

        $query .= " ORDER BY t.created_at DESC LIMIT 100";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $deposits = $stmt->fetchAll();

        Response::success('تم جلب طابور طلبات الإيداع بنجاح.', ['deposits' => $deposits]);
    }

    /**
     * Approve Deposit - Atomic Balance Credit
     */
    public static function approveDeposit(): void {
        $admin = AuthMiddleware::requireAdmin();
        $txId  = (int)($_POST['transaction_id'] ?? 0);
        $notes = Validator::sanitize($_POST['notes'] ?? 'تم التحقق من إشعار التحويل والموافقة على الإيداع');

        if ($txId <= 0) {
            Response::error('معرف المعاملة غير صالح.');
        }

        $pdo = Database::getConnection();
        $pdo->beginTransaction();

        try {
            // Lock pending transaction record exclusively
            $txStmt = $pdo->prepare("SELECT id, user_id, amount, status FROM transactions WHERE id = :id AND status = 'pending' FOR UPDATE");
            $txStmt->execute(['id' => $txId]);
            $tx = $txStmt->fetch();

            if (!$tx) {
                throw new RuntimeException("المعاملة غير موجودة أو تمت معالجتها واعتمادها مسبقاً.");
            }

            $amount = (float)$tx['amount'];
            $userId = (int)$tx['user_id'];

            // Lock user row and credit balance
            $userStmt = $pdo->prepare("SELECT id, balance FROM users WHERE id = :id FOR UPDATE");
            $userStmt->execute(['id' => $userId]);
            $user = $userStmt->fetch();

            if (!$user) {
                throw new RuntimeException("المستخدم المرتبط بالمعاملة غير موجود.");
            }

            $currentBalance = (float)$user['balance'];
            $newBalance = $currentBalance + $amount;

            // Update user balance
            $updUser = $pdo->prepare("UPDATE users SET balance = :balance WHERE id = :id");
            $updUser->execute(['balance' => $newBalance, 'id' => $userId]);

            // Update transaction status
            $updTx = $pdo->prepare("
                UPDATE transactions 
                SET status = 'approved',
                    balance_after = :new_balance,
                    admin_notes = :notes,
                    reviewed_by = :admin_id,
                    reviewed_at = NOW()
                WHERE id = :id
            ");
            $updTx->execute([
                'new_balance' => $newBalance,
                'notes'       => $notes,
                'admin_id'    => $admin['id'],
                'id'          => $txId
            ]);

            $pdo->commit();

            Response::success('تمت الموافقة على الإيداع وإضافة الرصيد لحساب المستخدم بنجاح.', [
                'transaction_id' => $txId,
                'credited_amount'=> $amount,
                'new_user_balance'=> $newBalance
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log("MAHAM Admin Approve Deposit Error: " . $e->getMessage());
            Response::error($e->getMessage() ?: 'فشلت معالجة تأكيد الإيداع.', 400);
        }
    }

    /**
     * Reject Deposit
     */
    public static function rejectDeposit(): void {
        $admin  = AuthMiddleware::requireAdmin();
        $txId   = (int)($_POST['transaction_id'] ?? 0);
        $reason = Validator::sanitize($_POST['reason'] ?? 'إشعار التحويل غير مطابق أو رقم الحوالة غير صحيح');

        if ($txId <= 0) {
            Response::error('معرف المعاملة غير صالح.');
        }

        $pdo = Database::getConnection();
        $pdo->beginTransaction();

        try {
            $txStmt = $pdo->prepare("SELECT id, status FROM transactions WHERE id = :id FOR UPDATE");
            $txStmt->execute(['id' => $txId]);
            $tx = $txStmt->fetch();

            if (!$tx || $tx['status'] !== 'pending') {
                throw new RuntimeException("المعاملة غير صالحة أو تمت معالجتها مسبقاً.");
            }

            $updTx = $pdo->prepare("
                UPDATE transactions 
                SET status = 'rejected',
                    admin_notes = :notes,
                    reviewed_by = :admin_id,
                    reviewed_at = NOW()
                WHERE id = :id
            ");
            $updTx->execute([
                'notes'    => $reason,
                'admin_id' => $admin['id'],
                'id'       => $txId
            ]);

            $pdo->commit();

            Response::success('تم رفض طلب الإيداع وتوثيق السبب في السجل المالي.', ['transaction_id' => $txId]);
        } catch (Exception $e) {
            $pdo->rollBack();
            Response::error($e->getMessage() ?: 'فشلت معالجة رفض الإيداع.', 400);
        }
    }

    /**
     * Get Withdrawals Queue
     */
    public static function getWithdrawals(): void {
        $admin  = AuthMiddleware::requireAdmin();
        $status = Validator::sanitize($_GET['status'] ?? 'pending');
        $pdo    = Database::getConnection();

        $query = "
            SELECT 
                t.id, t.tx_uuid, t.user_id, t.amount, t.payment_method,
                t.sender_account as receiver_account, t.status, t.admin_notes,
                t.created_at, t.reviewed_at,
                u.full_name as user_name, u.email as user_email, u.phone as user_phone,
                u.balance as user_available_balance, u.pending_balance as user_pending_balance
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE t.type = 'withdraw'
        ";

        $params = [];
        if (in_array($status, ['pending', 'approved', 'rejected'], true)) {
            $query .= " AND t.status = :status";
            $params['status'] = $status;
        }

        $query .= " ORDER BY t.created_at DESC LIMIT 100";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $withdrawals = $stmt->fetchAll();

        Response::success('تم جلب طابور طلبات السحب بنجاح.', ['withdrawals' => $withdrawals]);
    }

    /**
     * Approve Withdrawal - Confirm Payout and Deduct Pending Balance
     */
    public static function approveWithdrawal(): void {
        $admin = AuthMiddleware::requireAdmin();
        $txId  = (int)($_POST['transaction_id'] ?? 0);
        $notes = Validator::sanitize($_POST['notes'] ?? 'تم إرسال الحوالة المالية بنجاح لحساب العميل');

        if ($txId <= 0) {
            Response::error('معرف المعاملة غير صالح.');
        }

        $pdo = Database::getConnection();
        $pdo->beginTransaction();

        try {
            $txStmt = $pdo->prepare("SELECT id, user_id, amount, status FROM transactions WHERE id = :id AND status = 'pending' FOR UPDATE");
            $txStmt->execute(['id' => $txId]);
            $tx = $txStmt->fetch();

            if (!$tx) {
                throw new RuntimeException("طلب السحب غير صالح أو تمت معالجته وصرفه مسبقاً.");
            }

            $amount = (float)$tx['amount'];
            $userId = (int)$tx['user_id'];

            // Lock user and deduct from pending balance
            $userStmt = $pdo->prepare("SELECT id, pending_balance FROM users WHERE id = :id FOR UPDATE");
            $userStmt->execute(['id' => $userId]);
            $user = $userStmt->fetch();

            $currentPending = (float)$user['pending_balance'];
            $newPending = max(0.0, $currentPending - $amount);

            $updUser = $pdo->prepare("UPDATE users SET pending_balance = :pending WHERE id = :id");
            $updUser->execute(['pending' => $newPending, 'id' => $userId]);

            // Update transaction to approved
            $updTx = $pdo->prepare("
                UPDATE transactions 
                SET status = 'approved',
                    admin_notes = :notes,
                    reviewed_by = :admin_id,
                    reviewed_at = NOW()
                WHERE id = :id
            ");
            $updTx->execute([
                'notes'    => $notes,
                'admin_id' => $admin['id'],
                'id'       => $txId
            ]);

            $pdo->commit();

            Response::success('تم تأكيد صرف وتحويل الحوالة بنجاح وتحديث السجل المالي.', [
                'transaction_id' => $txId,
                'disbursed_amount' => $amount
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log("MAHAM Admin Approve Withdrawal Error: " . $e->getMessage());
            Response::error($e->getMessage() ?: 'فشلت معالجة تأكيد السحب.', 400);
        }
    }

    /**
     * Reject Withdrawal - Refund Held Funds Back to Available Balance
     */
    public static function rejectWithdrawal(): void {
        $admin  = AuthMiddleware::requireAdmin();
        $txId   = (int)($_POST['transaction_id'] ?? 0);
        $reason = Validator::sanitize($_POST['reason'] ?? 'رقم المحفظة غير صحيح أو الحساب مقفل لدى المشغل');

        if ($txId <= 0) {
            Response::error('معرف المعاملة غير صالح.');
        }

        $pdo = Database::getConnection();
        $pdo->beginTransaction();

        try {
            $txStmt = $pdo->prepare("SELECT id, user_id, amount, status FROM transactions WHERE id = :id AND status = 'pending' FOR UPDATE");
            $txStmt->execute(['id' => $txId]);
            $tx = $txStmt->fetch();

            if (!$tx) {
                throw new RuntimeException("طلب السحب غير صالح أو تمت معالجته وصرفه مسبقاً.");
            }

            $amount = (float)$tx['amount'];
            $userId = (int)$tx['user_id'];

            // Refund from pending_balance back to balance
            $userStmt = $pdo->prepare("SELECT id, balance, pending_balance FROM users WHERE id = :id FOR UPDATE");
            $userStmt->execute(['id' => $userId]);
            $user = $userStmt->fetch();

            $newBalance = (float)$user['balance'] + $amount;
            $newPending = max(0.0, (float)$user['pending_balance'] - $amount);

            $updUser = $pdo->prepare("UPDATE users SET balance = :balance, pending_balance = :pending WHERE id = :id");
            $updUser->execute([
                'balance' => $newBalance,
                'pending' => $newPending,
                'id'      => $userId
            ]);

            // Update transaction to rejected
            $updTx = $pdo->prepare("
                UPDATE transactions 
                SET status = 'rejected',
                    balance_after = :new_balance,
                    admin_notes = :notes,
                    reviewed_by = :admin_id,
                    reviewed_at = NOW()
                WHERE id = :id
            ");
            $updTx->execute([
                'new_balance' => $newBalance,
                'notes'       => $reason,
                'admin_id'    => $admin['id'],
                'id'          => $txId
            ]);

            $pdo->commit();

            Response::success('تم رفض طلب السحب وإعادة المبلغ فورياً إلى محفظة المستخدم.', [
                'transaction_id'  => $txId,
                'refunded_amount' => $amount,
                'new_user_balance'=> $newBalance
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log("MAHAM Admin Reject Withdrawal Error: " . $e->getMessage());
            Response::error($e->getMessage() ?: 'فشلت معالجة رفض السحب.', 400);
        }
    }

    /**
     * Micro-Task Link Manager: List Tasks
     */
    public static function getTasks(): void {
        $admin = AuthMiddleware::requireAdmin();
        $pdo   = Database::getConnection();

        $stmt = $pdo->query("
            SELECT t.*,
                   u.full_name as target_user_name,
                   u.email as target_user_email,
                   COUNT(c.id) as completions_count,
                   COALESCE(SUM(c.reward_earned), 0) as total_rewards_paid
            FROM tasks t
            LEFT JOIN users u ON t.target_user_id = u.id
            LEFT JOIN task_completions c ON t.id = c.task_id
            GROUP BY t.id
            ORDER BY t.id DESC
        ");
        $tasks = $stmt->fetchAll();

        Response::success('تم جلب قائمة المهام المركزية بنجاح.', ['tasks' => $tasks]);
    }

    /**
     * Micro-Task Link Manager: Create New Task (Supports Target User & Attachments)
     */
    public static function createTask(): void {
        $admin = AuthMiddleware::requireAdmin();

        $title         = Validator::sanitize($_POST['title'] ?? '');
        $description   = Validator::sanitize($_POST['description'] ?? '');
        $category      = Validator::sanitize($_POST['category'] ?? 'video');
        $targetUrl     = filter_var(trim((string)($_POST['target_url'] ?? '')), FILTER_VALIDATE_URL);
        $attachmentUrl = !empty($_POST['attachment_url']) ? filter_var(trim((string)$_POST['attachment_url']), FILTER_VALIDATE_URL) ?: null : null;
        $targetType    = in_array($_POST['target_type'] ?? 'all', ['all', 'specific'], true) ? $_POST['target_type'] : 'all';
        $targetUserId  = ($targetType === 'specific' && !empty($_POST['target_user_id'])) ? (int)$_POST['target_user_id'] : null;
        $rewardAmount  = (float)($_POST['reward_amount'] ?? 250);
        $requiredSec   = (int)($_POST['required_seconds'] ?? 30);
        $minVipLevel   = (int)($_POST['min_vip_level'] ?? 0);
        $isActive      = isset($_POST['is_active']) ? (int)$_POST['is_active'] : 1;

        if (mb_strlen($title) < 5 || empty($description)) {
            Response::error('يرجى إدخال عنوان وتفاصيل المهمة بشكل دقيق.');
        }

        if (!$targetUrl) {
            Response::error('رابط المهمة المستهدف غير صالح. يجب أن يبدأ بـ http:// أو https://.');
        }

        if ($targetType === 'specific' && !$targetUserId) {
            Response::error('يرجى تحديد المستخدم المستهدف للمهمة الموجهة.');
        }

        if ($rewardAmount <= 0) {
            Response::error('مكافأة المهمة يجب أن تكون أكبر من صفر.');
        }

        if ($requiredSec < 30) {
            $requiredSec = 30; // Minimum 30s anti-cheat duration
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            INSERT INTO tasks (title, description, category, target_url, attachment_url, target_type, target_user_id, reward_amount, required_seconds, min_vip_level, is_active)
            VALUES (:title, :desc, :cat, :url, :attach, :target_type, :target_user, :reward, :seconds, :vip, :active)
        ");
        $stmt->execute([
            'title'       => $title,
            'desc'        => $description,
            'cat'         => $category,
            'url'         => $targetUrl,
            'attach'      => $attachmentUrl,
            'target_type' => $targetType,
            'target_user' => $targetUserId,
            'reward'      => $rewardAmount,
            'seconds'     => $requiredSec,
            'vip'         => $minVipLevel,
            'active'      => $isActive
        ]);

        $newTaskId = (int)$pdo->lastInsertId();

        Response::success('تمت إضافة المهمة بنجاح وتوجيهها للمستهدفين.', ['task_id' => $newTaskId], 201);
    }

    /**
     * Micro-Task Link Manager: Toggle or Update Task
     */
    public static function updateTask(): void {
        $admin  = AuthMiddleware::requireAdmin();
        $taskId = (int)($_POST['task_id'] ?? 0);

        if ($taskId <= 0) {
            Response::error('معرف المهمة غير صالح.');
        }

        $pdo = Database::getConnection();

        // Support partial toggling of status or full edit
        if (isset($_POST['toggle_status'])) {
            $stmt = $pdo->prepare("UPDATE tasks SET is_active = NOT is_active WHERE id = :id");
            $stmt->execute(['id' => $taskId]);
            Response::success('تم تغيير حالة تفعيل المهمة بنجاح.');
        }

        $title        = Validator::sanitize($_POST['title'] ?? '');
        $description  = Validator::sanitize($_POST['description'] ?? '');
        $targetUrl    = filter_var(trim((string)($_POST['target_url'] ?? '')), FILTER_VALIDATE_URL);
        $rewardAmount = (float)($_POST['reward_amount'] ?? 250);
        $requiredSec  = (int)($_POST['required_seconds'] ?? 30);
        $isActive     = (int)($_POST['is_active'] ?? 1);

        if (mb_strlen($title) < 5 || !$targetUrl) {
            Response::error('يرجى ملء بيانات المهمة بشكل صحيح.');
        }

        $stmt = $pdo->prepare("
            UPDATE tasks 
            SET title = :title, description = :desc, target_url = :url, 
                reward_amount = :reward, required_seconds = :seconds, is_active = :active
            WHERE id = :id
        ");
        $stmt->execute([
            'title'   => $title,
            'desc'    => $description,
            'url'     => $targetUrl,
            'reward'  => $rewardAmount,
            'seconds' => max(30, $requiredSec),
            'active'  => $isActive,
            'id'      => $taskId
        ]);

        Response::success('تم تحديث بيانات المهمة بنجاح.');
    }

    /**
     * User Directory Oversight
     */
    public static function getUsers(): void {
        $admin  = AuthMiddleware::requireAdmin();
        $search = Validator::sanitize($_GET['search'] ?? '');
        $pdo    = Database::getConnection();

        $query = "
            SELECT 
                u.id, u.full_name, u.email, u.phone, u.role, u.balance,
                u.pending_balance, u.free_tasks_used, u.is_verified, u.status, u.created_at,
                (
                    SELECT p.name 
                    FROM user_subscriptions s
                    JOIN packages p ON s.package_id = p.id
                    WHERE s.user_id = u.id AND s.status = 'active' AND s.expires_at > NOW()
                    ORDER BY p.price DESC LIMIT 1
                ) as active_vip_name
            FROM users u
            WHERE u.role = 'user'
        ";

        $params = [];
        if (!empty($search)) {
            $query .= " AND (u.full_name LIKE :s1 OR u.email LIKE :s2 OR u.phone LIKE :s3)";
            $params['s1'] = "%{$search}%";
            $params['s2'] = "%{$search}%";
            $params['s3'] = "%{$search}%";
        }

        $query .= " ORDER BY u.created_at DESC LIMIT 100";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $users = $stmt->fetchAll();

        Response::success('تم جلب سجل المستخدمين بنجاح.', ['users' => $users]);
    }

    /**
     * Toggle User Status (Active vs Suspended)
     */
    public static function toggleUserStatus(): void {
        $admin  = AuthMiddleware::requireAdmin();
        $userId = (int)($_POST['user_id'] ?? 0);
        $status = Validator::sanitize($_POST['status'] ?? 'active');

        if ($userId <= 0 || !in_array($status, ['active', 'suspended', 'banned'], true)) {
            Response::error('معاملات التعديل غير صالحة.');
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("UPDATE users SET status = :status WHERE id = :id AND role = 'user'");
        $stmt->execute(['status' => $status, 'id' => $userId]);

        Response::success("تم تعديل حالة الحساب بنجاح إلى: {$status}.");
    }

    /**
     * Adjust User Balance (adjustBalance alias)
     */
    public static function adjustBalance(): void {
        self::adjustUserBalance();
    }

    /**
     * Adjust User Balance (Credit or Debit with Ledger Trail)
     */
    public static function adjustUserBalance(): void {
        $admin  = AuthMiddleware::requireAdmin();
        $userId = (int)($_POST['user_id'] ?? 0);
        $amount = (float)($_POST['amount'] ?? 0);
        $type   = Validator::sanitize($_POST['adjustment_type'] ?? 'credit'); // 'credit' or 'debit'
        $notes  = Validator::sanitize($_POST['notes'] ?? 'تعديل رصيد يدوي من الإدارة المركزية');

        if ($userId <= 0 || $amount <= 0) {
            Response::error('يرجى تحديد المستخدم والمبلغ المراد تعديله.');
        }

        $pdo = Database::getConnection();
        $pdo->beginTransaction();

        try {
            $userStmt = $pdo->prepare("SELECT id, balance FROM users WHERE id = :id FOR UPDATE");
            $userStmt->execute(['id' => $userId]);
            $user = $userStmt->fetch();

            if (!$user) {
                throw new RuntimeException("المستخدم غير موجود.");
            }

            $currentBalance = (float)$user['balance'];
            $newBalance = $type === 'credit' ? ($currentBalance + $amount) : ($currentBalance - $amount);

            if ($newBalance < 0) {
                throw new RuntimeException("الرصيد المتاح لا يكفي لتنفيذ عملية الخصم.");
            }

            // Generate Tx UUID
            $txUuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000,
                mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );

            // Record adjustment in ledger
            $txStmt = $pdo->prepare("
                INSERT INTO transactions (
                    tx_uuid, user_id, type, amount, balance_before, balance_after,
                    payment_method, status, admin_notes, reviewed_by, reviewed_at
                ) VALUES (
                    :tx_uuid, :user_id, 'deposit', :amount, :before, :after,
                    'internal_balance', 'approved', :notes, :admin_id, NOW()
                )
            ");
            $txStmt->execute([
                'tx_uuid'  => $txUuid,
                'user_id'  => $userId,
                'amount'   => $amount,
                'before'   => $currentBalance,
                'after'    => $newBalance,
                'notes'    => "[تسوية إدارية] " . $notes,
                'admin_id' => $admin['id']
            ]);

            // Update user balance
            $upd = $pdo->prepare("UPDATE users SET balance = :balance WHERE id = :id");
            $upd->execute(['balance' => $newBalance, 'id' => $userId]);

            $pdo->commit();

            Response::success('تمت تسوية وتعديل رصيد المستخدم بنجاح.', [
                'user_id'     => $userId,
                'new_balance' => $newBalance
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            Response::error($e->getMessage() ?: 'فشلت معالجة تعديل الرصيد.', 400);
        }
    }

    /**
     * Grant or Upgrade VIP Package for a User
     */
    public static function grantUserVip(): void {
        $admin     = AuthMiddleware::requireAdmin();
        $userId    = (int)($_POST['user_id'] ?? 0);
        $packageId = (int)($_POST['package_id'] ?? 0);
        $days      = (int)($_POST['duration_days'] ?? 30);

        if ($userId <= 0 || $packageId <= 0) {
            Response::error('معرف المستخدم أو معرف الباقة غير صالح.', 422);
        }

        $pdo = Database::getConnection();

        // Verify package exists
        $pkgStmt = $pdo->prepare("SELECT id, name, price, daily_profit FROM packages WHERE id = :id LIMIT 1");
        $pkgStmt->execute(['id' => $packageId]);
        $pkg = $pkgStmt->fetch();

        if (!$pkg) {
            Response::error('الباقة المطلوبة غير موجودة في النظام.', 404);
        }

        // Verify user exists
        $uStmt = $pdo->prepare("SELECT id, full_name FROM users WHERE id = :id AND role = 'user' LIMIT 1");
        $uStmt->execute(['id' => $userId]);
        $user = $uStmt->fetch();

        if (!$user) {
            Response::error('المستخدم غير موجود.', 404);
        }

        $expiresAt = date('Y-m-d H:i:s', strtotime("+{$days} days"));

        // Insert new active subscription record with required amount_paid and starts_at
        $insStmt = $pdo->prepare("
            INSERT INTO user_subscriptions (user_id, package_id, amount_paid, daily_profit_rate, starts_at, expires_at, status)
            VALUES (:user_id, :pkg_id, :paid, :rate, NOW(), :expires, 'active')
        ");
        $insStmt->execute([
            'user_id' => $userId,
            'pkg_id'  => $packageId,
            'paid'    => (float)$pkg['price'],
            'rate'    => (float)$pkg['daily_profit'],
            'expires' => $expiresAt
        ]);

        Response::success("تم تفعيل ومنح {$pkg['name']} للمستخدم {$user['full_name']} بنجاح حتى {$expiresAt}.");
    }

    /**
     * Get Platform Official Settings
     */
    public static function getSettings(): void {
        $admin = AuthMiddleware::requireAdmin();
        $pdo   = Database::getConnection();

        $stmt = $pdo->query("SELECT setting_key, setting_value, description FROM app_settings");
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        Response::success('تم جلب إعدادات المنصة بنجاح.', ['settings' => $settings]);
    }

    /**
     * Update Official Payment Accounts Settings
     */
    public static function updateSettings(): void {
        $admin = AuthMiddleware::requireAdmin();
        $pdo   = Database::getConnection();

        $allowedKeys = [
            'mastercard_number',
            'mastercard_holder',
            'asiacell_instructions',
            'official_account_name',
            'min_deposit_iqd',
            'min_withdraw_iqd'
        ];

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE setting_value = :v2");

            foreach ($allowedKeys as $key) {
                if (isset($_POST[$key])) {
                    $val = Validator::sanitize($_POST[$key]);
                    $stmt->execute(['k' => $key, 'v' => $val, 'v2' => $val]);
                }
            }

            $pdo->commit();
            Response::success('تم حفظ وتحديث أرقام المحافظ وإعدادات النظام بنجاح.');
        } catch (Exception $e) {
            $pdo->rollBack();
            Response::error('فشل حفظ الإعدادات.', 500);
        }
    }
}

