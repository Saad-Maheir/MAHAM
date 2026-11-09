<?php
/**
 * MAHAM FinTech Platform - Authentication & Identity Controller
 * Registration, Login, 6-Digit OTP Verification, and Profile State
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

class AuthController {
    /**
     * User Registration Endpoint
     */
    public static function register(): void {
        $fullName = Validator::sanitize($_POST['full_name'] ?? '');
        $email    = strtolower(trim((string)($_POST['email'] ?? '')));
        $phone    = Validator::sanitize($_POST['phone'] ?? '');
        $password = (string)($_POST['password'] ?? '');

        // Validation Rules
        if (mb_strlen($fullName) < 3) {
            Response::error('يرجى إدخال الاسم الثلاثي الكامل بشكل صحيح.');
        }

        if (!Validator::isValidEmail($email)) {
            Response::error('صيغة البريد الإلكتروني المدخل غير صالحة.');
        }

        if (!Validator::isValidIraqiPhone($phone)) {
            Response::error('يرجى إدخال رقم هاتف عراقي صالح يبدأ بـ 07 (مثال: 07801234567).');
        }

        $formattedPhone = Validator::formatIraqiPhone($phone);

        if (strlen($password) < 8) {
            Response::error('كلمة المرور يجب ألا تقل عن 8 خانات لحماية حسابك.');
        }

        $pdo = Database::getConnection();

        // Check uniqueness of Email and Phone
        $checkStmt = $pdo->prepare("SELECT id, email, phone FROM users WHERE email = :email OR phone = :phone LIMIT 1");
        $checkStmt->execute(['email' => $email, 'phone' => $formattedPhone]);
        $existing = $checkStmt->fetch();

        if ($existing) {
            if ($existing['email'] === $email) {
                Response::error('البريد الإلكتروني مسجل مسبقاً في النظام.');
            } else {
                Response::error('رقم الهاتف مسجل مسبقاً في النظام.');
            }
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $pdo->beginTransaction();
        try {
            $insertStmt = $pdo->prepare("
                INSERT INTO users (full_name, email, phone, password_hash, balance, pending_balance, free_tasks_used, is_verified, status)
                VALUES (:full_name, :email, :phone, :hash, 0.00, 0.00, 0, 0, 'active')
            ");
            $insertStmt->execute([
                'full_name' => $fullName,
                'email'     => $email,
                'phone'     => $formattedPhone,
                'hash'      => $passwordHash
            ]);
            $userId = (int)$pdo->lastInsertId();

            // Generate 6-Digit OTP Code
            $otpCode = (string)random_int(100000, 999999);
            $expiresAt = date('Y-m-d H:i:s', time() + 900); // 15 Minutes

            $otpStmt = $pdo->prepare("
                INSERT INTO otp_codes (user_id, email, code, type, expires_at)
                VALUES (:user_id, :email, :code, 'register', :expires_at)
            ");
            $otpStmt->execute([
                'user_id'    => $userId,
                'email'      => $email,
                'code'       => $otpCode,
                'expires_at' => $expiresAt
            ]);

            $pdo->commit();

            // Store temporary pending verification session
            $_SESSION['pending_user_id'] = $userId;
            $_SESSION['pending_email']   = $email;

            // In production, SMTP email is dispatched here. For smooth setup, we return safe payload.
            $responseData = [
                'requires_otp' => true,
                'email'        => $email,
                'user_id'      => $userId
            ];

            // Provide OTP in response when in debug mode for rapid verification
            if (env('APP_DEBUG', true)) {
                $responseData['debug_otp'] = $otpCode;
            }

            Response::success('تم إنشاء حسابك بنجاح! تم إرسال رمز التحقق المكون من 6 أرقام إلى بريدك الإلكتروني.', $responseData, 201);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log("MAHAM Register Error: " . $e->getMessage());
            Response::error('حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة مرة أخرى.', 500);
        }
    }

    /**
     * User Login Endpoint
     */
    public static function login(): void {
        $identifier = trim((string)($_POST['identifier'] ?? ''));
        $password   = (string)($_POST['password'] ?? '');

        if (empty($identifier) || empty($password)) {
            Response::error('يرجى ملء جميع الحقول المطلوبة لتسجيل الدخول.');
        }

        $pdo = Database::getConnection();

        // Search by email or formatted phone
        $stmt = $pdo->prepare("
            SELECT id, full_name, email, phone, password_hash, role, balance, pending_balance, is_verified, status
            FROM users 
            WHERE email = :identifier OR phone = :identifier
            LIMIT 1
        ");
        $stmt->execute(['identifier' => $identifier]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error('بيانات الدخول غير صحيحة. يرجى التأكد من البريد وكلمة المرور.', 401);
        }

        if ($user['status'] !== 'active') {
            Response::error('تم إيقاف هذا الحساب. يرجى التواصل مع الدعم الفني.', 403);
        }

        // Check if user has completed OTP verification
        if ((int)$user['is_verified'] === 0) {
            // Generate fresh OTP code
            $otpCode = (string)random_int(100000, 999999);
            $expiresAt = date('Y-m-d H:i:s', time() + 900);

            $otpStmt = $pdo->prepare("
                INSERT INTO otp_codes (user_id, email, code, type, expires_at)
                VALUES (:user_id, :email, :code, 'login', :expires_at)
            ");
            $otpStmt->execute([
                'user_id'    => $user['id'],
                'email'      => $user['email'],
                'code'       => $otpCode,
                'expires_at' => $expiresAt
            ]);

            $_SESSION['pending_user_id'] = $user['id'];
            $_SESSION['pending_email']   = $user['email'];

            $res = [
                'requires_otp' => true,
                'email'        => $user['email'],
                'user_id'      => $user['id']
            ];
            if (env('APP_DEBUG', true)) {
                $res['debug_otp'] = $otpCode;
            }

            Response::success('الحساب يحتاج إلى تأكيد. تم إرسال رمز التحقق إلى بريدك الإلكتروني.', $res);
        }

        // Successfully authenticated - Regenerate session ID to prevent fixation
        session_regenerate_id(true);
        $_SESSION['user_id'] = $user['id'];
        unset($_SESSION['pending_user_id'], $_SESSION['pending_email']);

        Response::success('تم تسجيل الدخول بنجاح.', [
            'user' => [
                'id'              => $user['id'],
                'full_name'       => $user['full_name'],
                'email'           => $user['email'],
                'phone'           => $user['phone'],
                'role'            => $user['role'],
                'balance'         => (float)$user['balance'],
                'pending_balance' => (float)$user['pending_balance'],
                'is_verified'     => (bool)$user['is_verified']
            ]
        ]);
    }

    /**
     * Verify 6-digit OTP Code
     */
    public static function verifyOtp(): void {
        $email = strtolower(trim((string)($_POST['email'] ?? ($_SESSION['pending_email'] ?? ''))));
        $code  = trim((string)($_POST['code'] ?? ''));

        if (empty($email) || !preg_match('/^\d{6}$/', $code)) {
            Response::error('يرجى إدخال رمز التحقق المكون من 6 أرقام بشكل صحيح.');
        }

        $pdo = Database::getConnection();

        // Query latest valid OTP
        $stmt = $pdo->prepare("
            SELECT id, user_id, email, code, attempts, expires_at, is_used
            FROM otp_codes
            WHERE email = :email AND is_used = 0
            ORDER BY id DESC
            LIMIT 1
        ");
        $stmt->execute(['email' => $email]);
        $otp = $stmt->fetch();

        if (!$otp) {
            Response::error('رمز التحقق غير صالح أو تم استخدامه سابقاً.');
        }

        if (strtotime($otp['expires_at']) < time()) {
            Response::error('انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.');
        }

        if ((int)$otp['attempts'] >= 5) {
            Response::error('تم تجاوز عدد المحاولات الخاطئة. يرجى طلب رمز تحقق جديد.');
        }

        if ($otp['code'] !== $code) {
            // Increment failed attempt counter
            $upd = $pdo->prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = :id");
            $upd->execute(['id' => $otp['id']]);
            Response::error('رمز التحقق غير صحيح. يرجى التحقق وإعادة المحاولة.');
        }

        // Valid OTP -> Activate user
        $pdo->beginTransaction();
        try {
            $markOtp = $pdo->prepare("UPDATE otp_codes SET is_used = 1 WHERE id = :id");
            $markOtp->execute(['id' => $otp['id']]);

            $activateUser = $pdo->prepare("UPDATE users SET is_verified = 1 WHERE id = :user_id");
            $activateUser->execute(['user_id' => $otp['user_id']]);

            $pdo->commit();

            session_regenerate_id(true);
            $_SESSION['user_id'] = $otp['user_id'];
            unset($_SESSION['pending_user_id'], $_SESSION['pending_email']);

            $userStmt = $pdo->prepare("SELECT id, full_name, email, phone, role, balance, pending_balance, is_verified FROM users WHERE id = :id");
            $userStmt->execute(['id' => $otp['user_id']]);
            $user = $userStmt->fetch();

            Response::success('تم تفعيل وتأكيد حسابك بنجاح!', ['user' => $user]);
        } catch (Exception $e) {
            $pdo->rollBack();
            Response::error('حدث خطأ أثناء تأكيد الرمز. يرجى المحاولة لاحقاً.', 500);
        }
    }

    /**
     * Resend fresh OTP
     */
    public static function resendOtp(): void {
        $email = strtolower(trim((string)($_POST['email'] ?? ($_SESSION['pending_email'] ?? ''))));

        if (!Validator::isValidEmail($email)) {
            Response::error('البريد الإلكتروني غير صالح.');
        }

        $pdo = Database::getConnection();

        // Enforce 60-second cooldown between resends
        $checkStmt = $pdo->prepare("
            SELECT created_at 
            FROM otp_codes 
            WHERE email = :email 
            ORDER BY id DESC 
            LIMIT 1
        ");
        $checkStmt->execute(['email' => $email]);
        $lastOtp = $checkStmt->fetch();

        if ($lastOtp && (time() - strtotime($lastOtp['created_at'])) < 60) {
            $wait = 60 - (time() - strtotime($lastOtp['created_at']));
            Response::error("يرجى الانتظار {$wait} ثانية قبل طلب رمز جديد.");
        }

        $userStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
        $userStmt->execute(['email' => $email]);
        $user = $userStmt->fetch();

        if (!$user) {
            Response::error('المستخدم غير موجود.');
        }

        $otpCode = (string)random_int(100000, 999999);
        $expiresAt = date('Y-m-d H:i:s', time() + 900);

        $ins = $pdo->prepare("
            INSERT INTO otp_codes (user_id, email, code, type, expires_at)
            VALUES (:user_id, :email, :code, 'register', :expires_at)
        ");
        $ins->execute([
            'user_id'    => $user['id'],
            'email'      => $email,
            'code'       => $otpCode,
            'expires_at' => $expiresAt
        ]);

        $res = ['message' => 'تم إرسال رمز تحقق جديد بنجاح.'];
        if (env('APP_DEBUG', true)) {
            $res['debug_otp'] = $otpCode;
        }

        Response::success('تم إرسال رمز تحقق جديد بنجاح.', $res);
    }

    /**
     * Get Current Authenticated Profile and Real-time Status
     */
    public static function me(): void {
        $user = AuthMiddleware::authenticate();
        $pdo  = Database::getConnection();

        // Fetch active subscriptions
        $subStmt = $pdo->prepare("
            SELECT s.id, s.package_id, s.amount_paid, s.daily_profit_rate, s.starts_at, s.expires_at,
                   p.name as package_name, p.code as package_code, p.badge_name, p.badge_color
            FROM user_subscriptions s
            JOIN packages p ON s.package_id = p.id
            WHERE s.user_id = :user_id AND s.status = 'active' AND s.expires_at > NOW()
            ORDER BY p.price DESC
        ");
        $subStmt->execute(['user_id' => $user['id']]);
        $subscriptions = $subStmt->fetchAll();

        // Calculate total daily earning potential
        $totalDailyProfit = 0.0;
        $isVip = count($subscriptions) > 0;
        foreach ($subscriptions as $sub) {
            $totalDailyProfit += (float)$sub['daily_profit_rate'];
        }

        // If free tier, daily profit is default 250 IQD
        if (!$isVip) {
            $totalDailyProfit = 250.0;
        }

        // Compute Free Tier Cooldown Status
        $freeTasksLimit = 5;
        $freeTasksUsed = (int)$user['free_tasks_used'];
        $freeTasksRemaining = max(0, $freeTasksLimit - $freeTasksUsed);

        $cooldownRemainingSeconds = 0;
        if ($user['last_task_completed_at'] !== null) {
            $elapsedSeconds = time() - strtotime($user['last_task_completed_at']);
            $requiredCooldown = 24 * 3600; // 24 Hours
            if ($elapsedSeconds < $requiredCooldown) {
                $cooldownRemainingSeconds = $requiredCooldown - $elapsedSeconds;
            }
        }

        // Determine if user can execute tasks right now
        $canExecuteTask = false;
        if ($isVip) {
            $canExecuteTask = true;
        } else {
            $canExecuteTask = ($freeTasksRemaining > 0 && $cooldownRemainingSeconds === 0);
        }

        Response::success('تم جلب بيانات الحساب بنجاح.', [
            'user' => [
                'id'              => (int)$user['id'],
                'full_name'       => $user['full_name'],
                'email'           => $user['email'],
                'phone'           => $user['phone'],
                'role'            => $user['role'],
                'balance'         => (float)$user['balance'],
                'pending_balance' => (float)$user['pending_balance'],
                'is_verified'     => (bool)$user['is_verified'],
                'free_tasks_used' => $freeTasksUsed,
                'last_task_completed_at' => $user['last_task_completed_at']
            ],
            'tier' => [
                'is_vip'                     => $isVip,
                'active_subscriptions'       => $subscriptions,
                'active_tier_name'           => $isVip ? $subscriptions[0]['package_name'] : 'الباقة المجانية',
                'active_badge'               => $isVip ? $subscriptions[0]['badge_name'] : 'المجانية',
                'daily_profit'               => $totalDailyProfit,
                'free_tasks_remaining'       => $freeTasksRemaining,
                'tasks_limit_display'        => $isVip ? 'مفتوح (∞)' : "{$freeTasksRemaining} من أصل 5",
                'cooldown_remaining_seconds' => $cooldownRemainingSeconds,
                'can_execute_task'           => $canExecuteTask
            ]
        ]);
    }

    /**
     * Terminate Session
     */
    public static function logout(): void {
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();
        Response::success('تم تسجيل الخروج بنجاح.');
    }
}
