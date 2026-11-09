<?php
/**
 * MAHAM FinTech Platform - Wallet & Financial Accounting Controller
 * Manual Deposits, Secure Receipts Storage, Atomic Withdrawals, Ledger Audit
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

class WalletController {
    /**
     * Get Real-time Wallet Balances and Official Payment Receiver Accounts
     */
    public static function getBalance(): void {
        $user = AuthMiddleware::authenticate();
        $pdo  = Database::getConnection();

        // 1. Fetch live balance from DB
        $userStmt = $pdo->prepare("SELECT balance, pending_balance FROM users WHERE id = :id LIMIT 1");
        $userStmt->execute(['id' => $user['id']]);
        $balances = $userStmt->fetch();

        // 2. Compute aggregate financial figures
        $aggStmt = $pdo->prepare("
            SELECT 
                COALESCE(SUM(CASE WHEN type = 'withdraw' AND status = 'approved' THEN amount ELSE 0 END), 0) as total_withdrawn,
                COALESCE(SUM(CASE WHEN type = 'deposit' AND status = 'approved' THEN amount ELSE 0 END), 0) as total_deposited,
                COALESCE(SUM(CASE WHEN type = 'task_reward' AND created_at >= CURDATE() THEN amount ELSE 0 END), 0) as today_earnings
            FROM transactions 
            WHERE user_id = :user_id
        ");
        $aggStmt->execute(['user_id' => $user['id']]);
        $aggregates = $aggStmt->fetch();

        // 3. Official Deposit Destinations
        $officialAccounts = [
            'zain_cash' => [
                'name'    => 'زين كاش (ZainCash)',
                'account' => env('OFFICIAL_ZAIN_CASH', '07801234567'),
                'title'   => env('OFFICIAL_RECIPIENT_NAME', 'شركة مهام للخدمات المالية ذ.م.م'),
                'icon'    => 'zaincash'
            ],
            'asia_hawala' => [
                'name'    => 'آسيا حوالة (AsiaHawala)',
                'account' => env('OFFICIAL_ASIA_HAWALA', '07709876543'),
                'title'   => env('OFFICIAL_RECIPIENT_NAME', 'شركة مهام للخدمات المالية ذ.م.م'),
                'icon'    => 'asiahawala'
            ],
            'qi_card' => [
                'name'    => 'كي كارد / مصرف الرافدين (Qi Card)',
                'account' => env('OFFICIAL_QI_CARD', 'IQ98RAFB0000001234567890'),
                'title'   => env('OFFICIAL_RECIPIENT_NAME', 'شركة مهام للخدمات المالية ذ.م.م'),
                'icon'    => 'qicard'
            ]
        ];

        Response::success('تم جلب بيانات المحفظة بنجاح.', [
            'available_balance' => (float)$balances['balance'],
            'pending_balance'   => (float)$balances['pending_balance'],
            'total_withdrawn'   => (float)$aggregates['total_withdrawn'],
            'total_deposited'   => (float)$aggregates['total_deposited'],
            'today_earnings'    => (float)$aggregates['today_earnings'],
            'official_accounts' => $officialAccounts,
            'min_deposit'       => (float)env('MIN_DEPOSIT_IQD', 5000),
            'min_withdraw'      => (float)env('MIN_WITHDRAW_IQD', 5000)
        ]);
    }

    /**
     * Submit Manual Deposit Request with Receipt Screenshot
     */
    public static function deposit(): void {
        $user = AuthMiddleware::authenticate();

        $paymentMethod = Validator::sanitize($_POST['payment_method'] ?? '');
        $amountRaw     = $_POST['amount'] ?? 0;
        $txReference   = Validator::sanitize($_POST['tx_reference'] ?? '');
        $senderAccount = Validator::sanitize($_POST['sender_account'] ?? '');

        // Allowed payment methods
        $allowedMethods = ['zain_cash', 'asia_hawala', 'qi_card'];
        if (!in_array($paymentMethod, $allowedMethods, true)) {
            Response::error('يرجى اختيار طريقة دفع معتمدة (زين كاش، آسيا حوالة، كي كارد).');
        }

        $minDeposit = (float)env('MIN_DEPOSIT_IQD', 5000);
        if (!Validator::isValidAmount($amountRaw, $minDeposit)) {
            Response::error("الحد الأدنى للإيداع هو " . number_format($minDeposit) . " د.ع.");
        }
        $amount = (float)$amountRaw;

        if (mb_strlen($txReference) < 4) {
            Response::error('يرجى إدخال رقم الحوالة أو الرقم المرجعي للإشعار بشكل صحيح.');
        }

        // Validate and save uploaded receipt screenshot
        if (!isset($_FILES['receipt'])) {
            Response::error('يرجى إرفاق صورة إشعار التحويل المالي.');
        }

        try {
            $receiptPath = Validator::storeReceiptUpload($_FILES['receipt']);
        } catch (Exception $e) {
            Response::error($e->getMessage());
        }

        $pdo = Database::getConnection();

        // Generate Transaction UUID
        $txUuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        $pdo->beginTransaction();
        try {
            $txStmt = $pdo->prepare("
                INSERT INTO transactions (
                    tx_uuid, user_id, type, amount, balance_before, balance_after,
                    payment_method, sender_account, tx_reference, receipt_image,
                    status, admin_notes
                ) VALUES (
                    :tx_uuid, :user_id, 'deposit', :amount, :balance, :balance,
                    :method, :sender, :ref, :receipt,
                    'pending', 'إيداع يدوي جديد بانتظار مراجعة الإدارة المالية'
                )
            ");
            $txStmt->execute([
                'tx_uuid' => $txUuid,
                'user_id' => $user['id'],
                'amount'  => $amount,
                'balance' => $user['balance'],
                'method'  => $paymentMethod,
                'sender'  => $senderAccount ?: null,
                'ref'     => $txReference,
                'receipt' => $receiptPath
            ]);

            $pdo->commit();

            Response::success('تم استلام طلب الإيداع بنجاح وهو الآن قيد التدقيق لدى فريق العمليات المالية.', [
                'tx_uuid'        => $txUuid,
                'amount'         => $amount,
                'payment_method' => $paymentMethod,
                'status'         => 'pending'
            ], 201);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log("MAHAM Deposit Error: " . $e->getMessage());
            Response::error('حدث خطأ أثناء تسجيل طلب الإيداع. يرجى المحاولة لاحقاً.', 500);
        }
    }

    /**
     * Submit Withdrawal Request - Atomic Balance Locking
     */
    public static function withdraw(): void {
        $user = AuthMiddleware::authenticate();

        $amountRaw       = $_POST['amount'] ?? 0;
        $paymentMethod   = Validator::sanitize($_POST['payment_method'] ?? '');
        $receiverAccount = Validator::sanitize($_POST['receiver_account'] ?? '');

        $allowedMethods = ['zain_cash', 'asia_hawala', 'qi_card'];
        if (!in_array($paymentMethod, $allowedMethods, true)) {
            Response::error('يرجى تحديد طريقة استلام أرباح صالحة.');
        }

        $minWithdraw = (float)env('MIN_WITHDRAW_IQD', 5000);
        if (!Validator::isValidAmount($amountRaw, $minWithdraw)) {
            Response::error("الحد الأدنى لسحب الأرباح هو " . number_format($minWithdraw) . " د.ع.");
        }
        $amount = (float)$amountRaw;

        if (mb_strlen($receiverAccount) < 6) {
            Response::error('يرجى إدخال رقم المحفظة أو الحساب المصرفي المستلم بدقة.');
        }

        $pdo = Database::getConnection();

        // Atomic Transaction: Lock Balance & Deduct Instantly
        $pdo->beginTransaction();
        try {
            $userLockStmt = $pdo->prepare("SELECT id, balance, pending_balance FROM users WHERE id = :id FOR UPDATE");
            $userLockStmt->execute(['id' => $user['id']]);
            $lockedUser = $userLockStmt->fetch();

            $currentBalance = (float)$lockedUser['balance'];
            if ($currentBalance < $amount) {
                throw new RuntimeException("الرصيد المتاح في محفظتك (" . number_format($currentBalance) . " د.ع) غير كافٍ لإتمام عملية السحب.");
            }

            $newBalance        = $currentBalance - $amount;
            $newPendingBalance = (float)$lockedUser['pending_balance'] + $amount;

            // Generate Tx UUID
            $txUuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000,
                mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );

            // Record Pending Withdrawal Transaction
            $txStmt = $pdo->prepare("
                INSERT INTO transactions (
                    tx_uuid, user_id, type, amount, balance_before, balance_after,
                    payment_method, sender_account, status, admin_notes
                ) VALUES (
                    :tx_uuid, :user_id, 'withdraw', :amount, :before, :after,
                    :method, :receiver, 'pending', 'طلب سحب أرباح قيد المراجعة والمطابقة'
                )
            ");
            $txStmt->execute([
                'tx_uuid'  => $txUuid,
                'user_id'  => $user['id'],
                'amount'   => $amount,
                'before'   => $currentBalance,
                'after'    => $newBalance,
                'method'   => $paymentMethod,
                'receiver' => $receiverAccount
            ]);

            // Update user balance atomically
            $updStmt = $pdo->prepare("
                UPDATE users 
                SET balance = :balance, pending_balance = :pending
                WHERE id = :id
            ");
            $updStmt->execute([
                'balance' => $newBalance,
                'pending' => $newPendingBalance,
                'id'      => $user['id']
            ]);

            $pdo->commit();

            Response::success('تم تقديم طلب سحب الأرباح بنجاح. سيتم تحويل المبلغ لحسابك خلال مدة أقصاها 6 ساعات.', [
                'tx_uuid'         => $txUuid,
                'amount'          => $amount,
                'new_balance'     => $newBalance,
                'pending_balance' => $newPendingBalance
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log("MAHAM Withdraw Error: " . $e->getMessage());
            Response::error($e->getMessage() ?: 'فشلت معالجة طلب السحب. يرجى المحاولة لاحقاً.', 400);
        }
    }

    /**
     * Get Transaction History with Status Labels
     */
    public static function getTransactions(): void {
        $user = AuthMiddleware::authenticate();
        $pdo  = Database::getConnection();

        $stmt = $pdo->prepare("
            SELECT id, tx_uuid, type, amount, balance_before, balance_after,
                   payment_method, sender_account, tx_reference, receipt_image,
                   status, admin_notes, created_at, reviewed_at
            FROM transactions
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            LIMIT 50
        ");
        $stmt->execute(['user_id' => $user['id']]);
        $transactions = $stmt->fetchAll();

        // Translate and format for client rendering
        $formatted = array_map(function ($tx) {
            $typeLabels = [
                'deposit'          => 'إيداع رصيد',
                'withdraw'         => 'سحب أرباح',
                'subscription_fee' => 'اشتراك باقة VIP',
                'task_reward'      => 'مكافأة مهمة يومية'
            ];

            $statusLabels = [
                'pending'  => 'قيد التدقيق',
                'approved' => 'مكتمل ومضاف',
                'rejected' => 'مرفوض'
            ];

            $methodLabels = [
                'zain_cash'        => 'زين كاش',
                'asia_hawala'      => 'آسيا حوالة',
                'qi_card'          => 'كي كارد / الرافدين',
                'wallet_balance'   => 'رصيد المحفظة'
            ];

            return [
                'id'             => (int)$tx['id'],
                'tx_uuid'        => $tx['tx_uuid'],
                'type'           => $tx['type'],
                'type_text'      => $typeLabels[$tx['type']] ?? $tx['type'],
                'amount'         => (float)$tx['amount'],
                'balance_before' => (float)$tx['balance_before'],
                'balance_after'  => (float)$tx['balance_after'],
                'payment_method' => $methodLabels[$tx['payment_method']] ?? ($tx['payment_method'] ?: '—'),
                'tx_reference'   => $tx['tx_reference'] ?: '—',
                'sender_account' => $tx['sender_account'] ?: '—',
                'receipt_image'  => $tx['receipt_image'],
                'status'         => $tx['status'],
                'status_text'    => $statusLabels[$tx['status']] ?? $tx['status'],
                'admin_notes'    => $tx['admin_notes'] ?: '',
                'created_at'     => $tx['created_at'],
                'formatted_date' => date('Y/m/d - H:i', strtotime($tx['created_at']))
            ];
        }, $transactions);

        Response::success('تم جلب سجل المعاملات المالية بنجاح.', ['transactions' => $formatted]);
    }
}
