<?php
/**
 * MAHAM FinTech Platform - VIP Subscription & Tier Management Controller
 * Atomic balance deduction, 5 VIP packages catalog, and auto-upgrade validation
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

class SubscriptionController {
    /**
     * Retrieve All Packages and Current User Subscription Status
     */
    public static function getPackages(): void {
        $user = AuthMiddleware::authenticate();
        $pdo  = Database::getConnection();

        // 1. Fetch all active packages
        $pkgStmt = $pdo->prepare("
            SELECT id, name, code, price, daily_profit, tasks_limit, cooldown_hours, duration_days,
                   badge_name, badge_color, description, sort_order
            FROM packages
            WHERE is_active = 1
            ORDER BY sort_order ASC
        ");
        $pkgStmt->execute();
        $packages = $pkgStmt->fetchAll();

        // 2. Fetch user active subscriptions
        $subStmt = $pdo->prepare("
            SELECT package_id, starts_at, expires_at, status, daily_profit_rate
            FROM user_subscriptions
            WHERE user_id = :user_id AND status = 'active' AND expires_at > NOW()
        ");
        $subStmt->execute(['user_id' => $user['id']]);
        $activeSubs = $subStmt->fetchAll();

        $activePackageIds = array_column($activeSubs, 'package_id');

        $formatted = array_map(function ($pkg) use ($activePackageIds, $activeSubs) {
            $isSubscribed = in_array((int)$pkg['id'], $activePackageIds, true);
            $expiryDate = null;

            if ($isSubscribed) {
                foreach ($activeSubs as $sub) {
                    if ((int)$sub['package_id'] === (int)$pkg['id']) {
                        $expiryDate = $sub['expires_at'];
                        break;
                    }
                }
            }

            return [
                'id'             => (int)$pkg['id'],
                'name'           => $pkg['name'],
                'code'           => $pkg['code'],
                'price'          => (float)$pkg['price'],
                'daily_profit'   => (float)$pkg['daily_profit'],
                'tasks_limit'    => $pkg['tasks_limit'] !== null ? (int)$pkg['tasks_limit'] : null,
                'tasks_display'  => $pkg['tasks_limit'] !== null ? "{$pkg['tasks_limit']} مهام" : 'مفتوح (∞)',
                'duration_days'  => (int)$pkg['duration_days'],
                'badge_name'     => $pkg['badge_name'],
                'badge_color'    => $pkg['badge_color'],
                'description'    => $pkg['description'],
                'is_active_tier' => $isSubscribed,
                'expires_at'     => $expiryDate
            ];
        }, $packages);

        Response::success('تم جلب قائمة الباقات والاشتراكات بنجاح.', [
            'packages'     => $formatted,
            'user_balance' => (float)$user['balance']
        ]);
    }

    /**
     * Subscribe to a VIP Package - Atomic Balance Check and Deduction
     */
    public static function subscribe(): void {
        $user      = AuthMiddleware::authenticate();
        $packageId = (int)($_POST['package_id'] ?? 0);

        if ($packageId <= 0) {
            Response::error('معرف الباقة غير صالح.');
        }

        $pdo = Database::getConnection();

        // 1. Fetch package specifications
        $pkgStmt = $pdo->prepare("
            SELECT id, name, code, price, daily_profit, duration_days, is_active
            FROM packages
            WHERE id = :id AND is_active = 1
            LIMIT 1
        ");
        $pkgStmt->execute(['id' => $packageId]);
        $package = $pkgStmt->fetch();

        if (!$package) {
            Response::error('الباقة المختارة غير متوفرة أو غير نشطة.');
        }

        if ($package['code'] === 'free') {
            Response::error('أنت مفعل بالفعل على الباقة الأساسية.');
        }

        $packagePrice = (float)$package['price'];
        $dailyProfit  = (float)$package['daily_profit'];
        $durationDays = (int)$package['duration_days'];

        // 2. Atomic Database Transaction with FOR UPDATE Lock
        $pdo->beginTransaction();
        try {
            $userLockStmt = $pdo->prepare("SELECT id, balance FROM users WHERE id = :id FOR UPDATE");
            $userLockStmt->execute(['id' => $user['id']]);
            $lockedUser = $userLockStmt->fetch();

            $currentBalance = (float)$lockedUser['balance'];

            // 3. Balance Sufficiency Check
            if ($currentBalance < $packagePrice) {
                $missingAmount = $packagePrice - $currentBalance;
                $pdo->rollBack();

                // Return structured HTTP 422 payload enabling frontend redirect to deposit
                Response::error("الرصيد المتاح غير كافٍ للاشتراك في هذه الباقة.", 422, [
                    'insufficient_balance' => true,
                    'required_amount'      => $packagePrice,
                    'current_balance'      => $currentBalance,
                    'missing_amount'       => $missingAmount,
                    'package_name'         => $package['name']
                ]);
            }

            $newBalance = $currentBalance - $packagePrice;

            // Generate Tx UUID
            $txUuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000,
                mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );

            // Record Subscription Fee in Financial Ledger
            $txStmt = $pdo->prepare("
                INSERT INTO transactions (
                    tx_uuid, user_id, type, amount, balance_before, balance_after,
                    payment_method, status, admin_notes
                ) VALUES (
                    :tx_uuid, :user_id, 'subscription_fee', :amount, :before, :after,
                    'wallet_balance', 'approved', :notes
                )
            ");
            $txStmt->execute([
                'tx_uuid' => $txUuid,
                'user_id' => $user['id'],
                'amount'  => $packagePrice,
                'before'  => $currentBalance,
                'after'   => $newBalance,
                'notes'   => 'رسوم الاشتراك في ' . $package['name']
            ]);

            // Activate User Subscription
            $subStmt = $pdo->prepare("
                INSERT INTO user_subscriptions (
                    user_id, package_id, amount_paid, daily_profit_rate,
                    starts_at, expires_at, status
                ) VALUES (
                    :user_id, :pkg_id, :paid, :rate,
                    NOW(), DATE_ADD(NOW(), INTERVAL :days DAY), 'active'
                )
            ");
            $subStmt->execute([
                'user_id' => $user['id'],
                'pkg_id'  => $packageId,
                'paid'    => $packagePrice,
                'rate'    => $dailyProfit,
                'days'    => $durationDays
            ]);

            // Deduct balance from user
            $updUser = $pdo->prepare("UPDATE users SET balance = :balance WHERE id = :id");
            $updUser->execute([
                'balance' => $newBalance,
                'id'      => $user['id']
            ]);

            $pdo->commit();

            Response::success("تهانينا! تم تفعيل اشتراكك في {$package['name']} بنجاح ومضاعفة قدرتك الربحية.", [
                'package_id'   => $packageId,
                'package_name' => $package['name'],
                'amount_paid'  => $packagePrice,
                'new_balance'  => $newBalance,
                'daily_profit' => $dailyProfit,
                'expires_at'   => date('Y-m-d H:i:s', strtotime("+{$durationDays} days"))
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log("MAHAM Subscription Error: " . $e->getMessage());
            Response::error($e->getMessage() ?: 'فشلت معالجة الاشتراك. يرجى المحاولة لاحقاً.', 400);
        }
    }
}

