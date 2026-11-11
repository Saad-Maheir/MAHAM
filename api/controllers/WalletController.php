<?php
/**
 * MAHAM FinTech Platform - Wallet & Financial Accounting Controller
 * Manual Deposits (Asiacell 14-digit Cards & MasterCard Transfers), Anti-Fraud Card Lock,
 * Exclusive MasterCard Withdrawals with Row-Level Atomic Locking, Real-time Alerts Engine
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

        // 3. Read official payment settings dynamically from app_settings table
        $settingsStmt = $pdo->query("SELECT setting_key, setting_value FROM app_settings");
        $appSettings  = $settingsStmt ? $settingsStmt->fetchAll(PDO::FETCH_KEY_PAIR) : [];

        $mcNumber = !empty($appSettings['mastercard_number']) ? $appSettings['mastercard_number'] : env('OFFICIAL_MASTERCARD_NUMBER', '5300 1234 5678 9012');
        $mcHolder = !empty($appSettings['mastercard_holder']) ? $appSettings['mastercard_holder'] : (!empty($appSettings['official_account_name']) ? $appSettings['official_account_name'] : env('OFFICIAL_MASTERCARD_HOLDER', 'شركة مهام للخدمات المالية ذ.م.م'));
        $asiaInstructions = !empty($appSettings['asiacell_instructions']) ? $appSettings['asiacell_instructions'] : 'أدخل قيمة الرصيد ورقم كارت الشحن المكون من 14 رقماً ثم اضغط تأكيد الإيداع (بدون الحاجة لرفع أي صورة إشعار).';
        $minDeposit = !empty($appSettings['min_deposit_iqd']) ? (float)$appSettings['min_deposit_iqd'] : (float)env('MIN_DEPOSIT_IQD', 5000);
        $minWithdraw = !empty($appSettings['min_withdraw_iqd']) ? (float)$appSettings['min_withdraw_iqd'] : (float)env('MIN_WITHDRAW_IQD', 10000);

        // Official Deposit Destinations: Strictly Asiacell & MasterCard
        $officialAccounts = [
            'asiacell' => [
                'name'         => 'آسيا سيل (Asiacell)',
                'type'         => 'scratch_card',
                'title'        => 'شحن فوري عبر كروت تعبئة آسيا سيل',
                'account'      => 'كارت شحن 14 رقماً',
                'instructions' => $asiaInstructions,
                'icon'         => 'asiacell'
            ],
            'mastercard' => [
                'name'         => 'ماستر كارد (MasterCard)',
                'type'         => 'card_transfer',
                'title'        => $mcHolder,
                'account'      => $mcNumber,
                'instructions' => 'قم بالتحويل إلى رقم الماستر كارد أعلاه ثم أرفق صورة إشعار التحويل المالي',
                'icon'         => 'mastercard'
            ]
        ];

        Response::success('تم جلب بيانات المحفظة بنجاح.', [
            'available_balance'     => (float)$balances['balance'],
            'pending_balance'       => (float)$balances['pending_balance'],
            'total_withdrawn'       => (float)$aggregates['total_withdrawn'],
            'total_deposited'       => (float)$aggregates['total_deposited'],
            'today_earnings'        => (float)$aggregates['today_earnings'],
            'official_accounts'     => $officialAccounts,
            'mastercard_number'     => $mcNumber,
            'mastercard_holder'     => $mcHolder,
            'asiacell_instructions' => $asiaInstructions,
            'min_deposit_iqd'       => $minDeposit,
            'min_withdraw_iqd'      => $minWithdraw,
            'min_deposit'           => $minDeposit,
            'min_withdraw'          => $minWithdraw
        ]);
    }

    /**
     * Submit Deposit Request
     * 1) Asiacell: 14-digit scratch card, Anti-Fraud duplicate check, No receipt image required.
     * 2) MasterCard: Official card transfer with mandatory screenshot receipt.
     */
    public static function deposit(): void {
        $user = AuthMiddleware::authenticate();

        $paymentMethod = Validator::sanitize($_POST['payment_method'] ?? '');
        $amountRaw     = $_POST['amount'] ?? 0;
        $txReference   = Validator::sanitize($_POST['tx_reference'] ?? ($_POST['card_number'] ?? ''));
        $senderAccount = Validator::sanitize($_POST['sender_account'] ?? '');

        // Strictly Asiacell & MasterCard
        $allowedMethods = ['asiacell', 'mastercard'];
        if (!in_array($paymentMethod, $allowedMethods, true)) {
            Response::error('يرجى اختيار طريقة دفع معتمدة (آسيا سيل أو ماستر كارد).');
        }

        $pdo = Database::getConnection();

        // Read dynamic minimum deposit from app_settings
        $settingsStmt = $pdo->query("SELECT setting_key, setting_value FROM app_settings");
        $appSettings  = $settingsStmt ? $settingsStmt->fetchAll(PDO::FETCH_KEY_PAIR) : [];
        $minDeposit   = !empty($appSettings['min_deposit_iqd']) ? (float)$appSettings['min_deposit_iqd'] : (float)env('MIN_DEPOSIT_IQD', 5000);

        if (!Validator::isValidAmount($amountRaw, $minDeposit)) {
            Response::error("الحد الأدنى للإيداع هو " . number_format($minDeposit) . " د.ع.");
        }
        $amount = (float)$amountRaw;
        $receiptPath = null;
        $cleanReference = '';

        if ($paymentMethod === 'asiacell') {
            // Validate 14-digit Asiacell Scratch Card
            $cleanReference = preg_replace('/\D/', '', $txReference);
            if (strlen($cleanReference) !== 14) {
                Response::error('يرجى إدخال رقم كارت شحن آسيا سيل المكون من 14 رقماً بالضبط وبدون مسافات.');
            }

            // Anti-Fraud Protection: Check for Duplicate Card Submission
            $dupStmt = $pdo->prepare("
                SELECT id 
                FROM transactions 
                WHERE type = 'deposit' 
                  AND (tx_reference = :ref OR sender_account LIKE :ref_like)
                LIMIT 1
            ");
            $dupStmt->execute([
                'ref'      => $cleanReference,
                'ref_like' => "%{$cleanReference}%"
            ]);
            $existing = $dupStmt->fetch();

            if ($existing) {
                Response::error('رقم كارت آسيا سيل هذا تم إرساله مسبقاً!');
            }

            $senderAccount = 'كارت آسيا سيل: ' . $cleanReference;
            // No receipt image is required for Asiacell
        } else {
            // MasterCard: Receipt Screenshot is MANDATORY
            if (!isset($_FILES['receipt']) || $_FILES['receipt']['error'] !== UPLOAD_ERR_OK) {
                Response::error('يرجى إرفاق صورة إشعار التحويل المالي (Screenshot) لإيداع الماستر كارد.');
            }

            try {
                $receiptPath = Validator::storeReceiptUpload($_FILES['receipt']);
            } catch (Exception $e) {
                Response::error($e->getMessage());
            }

            $cleanReference = $txReference ?: 'تحويل ماستر كارد';
            $senderAccount  = $senderAccount ?: 'حساب العميل المحول';
        }

        // Generate Secure Transaction UUID
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
                    'pending', :notes
                )
            ");

            $initialNote = ($paymentMethod === 'asiacell')
                ? "إيداع كارت آسيا سيل [{$cleanReference}] بانتظار التحقق من الرصيد والاعتماد"
                : "إيداع ماستر كارد بانتظار مراجعة إشعار التحويل والاعتماد";

            $txStmt->execute([
                'tx_uuid' => $txUuid,
                'user_id' => $user['id'],
                'amount'  => $amount,
                'balance' => $user['balance'],
                'method'  => $paymentMethod,
                'sender'  => $senderAccount,
                'ref'     => $cleanReference,
                'receipt' => $receiptPath,
                'notes'   => $initialNote
            ]);

            $pdo->commit();

            $successMsg = ($paymentMethod === 'asiacell')
                ? 'تم استلام رقم كارت آسيا سيل بنجاح، وجاري التحقق منه وإضافة الرصيد لحسابك.'
                : 'تم استلام طلب إيداع الماستر كارد وإشعار التحويل بنجاح، وهو قيد المراجعة الفورية.';

            Response::success($successMsg, [
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
     * Submit Withdrawal Request - Strictly MasterCard Exclusive
     * Atomic Row-Level Locking (SELECT ... FOR UPDATE)
     */
    public static function withdraw(): void {
        $user = AuthMiddleware::authenticate();

        $amountRaw       = $_POST['amount'] ?? 0;
        $paymentMethod   = Validator::sanitize($_POST['payment_method'] ?? 'mastercard');
        $receiverAccount = Validator::sanitize($_POST['receiver_account'] ?? '');

        // Strictly MasterCard for withdrawals
        if ($paymentMethod !== 'mastercard') {
            Response::error('سحب الأرباح متاح حصرياً عبر بطاقات الماستر كارد (MasterCard).');
        }

        $pdo = Database::getConnection();

        // Read dynamic minimum withdrawal from app_settings
        $settingsStmt = $pdo->query("SELECT setting_key, setting_value FROM app_settings");
        $appSettings  = $settingsStmt ? $settingsStmt->fetchAll(PDO::FETCH_KEY_PAIR) : [];
        $minWithdraw  = !empty($appSettings['min_withdraw_iqd']) ? (float)$appSettings['min_withdraw_iqd'] : (float)env('MIN_WITHDRAW_IQD', 10000);

        if (!Validator::isValidAmount($amountRaw, $minWithdraw)) {
            Response::error("الحد الأدنى لسحب الأرباح هو " . number_format($minWithdraw) . " د.ع.");
        }
        $amount = (float)$amountRaw;

        // Clean and validate MasterCard serial / card number
        $cleanMasterCard = preg_replace('/[\s\-]/', '', $receiverAccount);
        if (strlen($cleanMasterCard) < 8 || strlen($cleanMasterCard) > 20) {
            Response::error('يرجى إدخال الرقم التسلسلي لبطاقة الماستر كارد (رقم البطاقة المستلمة) بدقة (8 إلى 20 رقماً).');
        }

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
                    'mastercard', :receiver, 'pending', 'طلب سحب أرباح عبر ماستر كارد قيد التحويل والصرف'
                )
            ");
            $txStmt->execute([
                'tx_uuid'  => $txUuid,
                'user_id'  => $user['id'],
                'amount'   => $amount,
                'before'   => $currentBalance,
                'after'    => $newBalance,
                'receiver' => $cleanMasterCard
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

            Response::success('تم تقديم طلب سحب الأرباح بنجاح. سيتم تحويل المبلغ لبطاقة الماستر كارد الخاصة بك خلال مدة أقصاها 6 ساعات.', [
                'tx_uuid'         => $txUuid,
                'amount'          => $amount,
                'card_number'     => $cleanMasterCard,
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
                'asiacell'       => 'كارت آسيا سيل',
                'mastercard'     => 'ماستر كارد (MasterCard)',
                'zain_cash'      => 'زين كاش (أرشيف)',
                'asia_hawala'    => 'آسيا حوالة (أرشيف)',
                'qi_card'        => 'كي كارد (أرشيف)',
                'wallet_balance' => 'رصيد المحفظة'
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

    /**
     * Get Real-time User Financial Notifications (The Bell 🔔 Engine)
     */
    public static function getNotifications(): void {
        $user = AuthMiddleware::authenticate();
        $pdo  = Database::getConnection();

        $stmt = $pdo->prepare("
            SELECT id, tx_uuid, type, amount, payment_method, sender_account, tx_reference,
                   status, admin_notes, created_at, reviewed_at
            FROM transactions
            WHERE user_id = :user_id
            ORDER BY COALESCE(reviewed_at, created_at) DESC
            LIMIT 25
        ");
        $stmt->execute(['user_id' => $user['id']]);
        $rows = $stmt->fetchAll();

        $notifications = [];
        $unreadCount = 0;

        foreach ($rows as $row) {
            $status = $row['status'];
            $type   = $row['type'];
            $amount = number_format((float)$row['amount']) . ' د.ع';

            if ($type === 'withdraw') {
                if ($status === 'approved') {
                    $notifications[] = [
                        'id'         => $row['id'],
                        'title'      => 'تم تحويل أرباحك بنجاح! 💸',
                        'message'    => "✅ تم تحويل مبلغ {$amount} إلى بطاقة الماستر كارد الخاصة بك بنجاح!",
                        'type'       => 'success',
                        'timestamp'  => $row['reviewed_at'] ?: $row['created_at'],
                        'is_recent'  => (strtotime($row['reviewed_at'] ?: $row['created_at']) > (time() - 86400 * 3))
                    ];
                    $unreadCount++;
                } elseif ($status === 'rejected') {
                    $reason = $row['admin_notes'] ? "السبب: {$row['admin_notes']}" : 'يرجى التأكد من صحة رقم بطاقة الماستر كارد.';
                    $notifications[] = [
                        'id'         => $row['id'],
                        'title'      => 'تم رفض طلب السحب ⚠️',
                        'message'    => "❌ تعذر تحويل مبلغ {$amount} وتم إرجاع الرصيد لمحفظتك. {$reason}",
                        'type'       => 'error',
                        'timestamp'  => $row['reviewed_at'] ?: $row['created_at'],
                        'is_recent'  => (strtotime($row['reviewed_at'] ?: $row['created_at']) > (time() - 86400 * 3))
                    ];
                    $unreadCount++;
                }
            } elseif ($type === 'deposit') {
                if ($status === 'approved') {
                    $notifications[] = [
                        'id'         => $row['id'],
                        'title'      => 'تأكيد الإيداع وإضافة الرصيد ✅',
                        'message'    => "✅ تم تأكيد إيداعك وإضافة {$amount} إلى رصيدك بنجاح!",
                        'type'       => 'success',
                        'timestamp'  => $row['reviewed_at'] ?: $row['created_at'],
                        'is_recent'  => (strtotime($row['reviewed_at'] ?: $row['created_at']) > (time() - 86400 * 3))
                    ];
                    $unreadCount++;
                } elseif ($status === 'rejected') {
                    $reason = $row['admin_notes'] ? "السبب: {$row['admin_notes']}" : 'الكارت أو الإشعار غير مطابق.';
                    $notifications[] = [
                        'id'         => $row['id'],
                        'title'      => 'تم رفض طلب الإيداع ⚠️',
                        'message'    => "❌ تم رفض إيداع بمبلغ {$amount}. {$reason}",
                        'type'       => 'error',
                        'timestamp'  => $row['reviewed_at'] ?: $row['created_at'],
                        'is_recent'  => (strtotime($row['reviewed_at'] ?: $row['created_at']) > (time() - 86400 * 3))
                    ];
                    $unreadCount++;
                }
            }
        }

        Response::success('تم جلب الإشعارات بنجاح.', [
            'notifications' => $notifications,
            'unread_count'  => $unreadCount
        ]);
    }
}
