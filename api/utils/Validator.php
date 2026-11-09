<?php
/**
 * MAHAM FinTech Platform - Security & Input Validation Engine
 * Validates Iraqi mobile numbers, strict MIME-types, and financial amounts
 */

declare(strict_types=1);

class Validator {
    /**
     * Sanitize string against XSS injection
     */
    public static function sanitize(mixed $value): string {
        if ($value === null) {
            return '';
        }
        return htmlspecialchars(trim((string)$value), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * Validate RFC-compliant email address
     */
    public static function isValidEmail(string $email): bool {
        return (bool)filter_var($email, FILTER_VALIDATE_EMAIL);
    }

    /**
     * Validate flexible phone format (8 to 15 digits - supports Iraq, Egypt, and International numbers)
     */
    public static function isValidIraqiPhone(string $phone): bool {
        $clean = preg_replace('/[\s\-\+]/', '', $phone);
        return (bool)preg_match('/^\d{8,15}$/', $clean);
    }

    /**
     * Format phone to clean canonical digits
     */
    public static function formatIraqiPhone(string $phone): string {
        $clean = preg_replace('/[\s\-\+]/', '', $phone);
        return $clean;
    }

    /**
     * Validate positive financial decimal value
     */
    public static function isValidAmount(mixed $amount, float $min = 1.0): bool {
        if (!is_numeric($amount)) {
            return false;
        }
        $val = (float)$amount;
        return $val >= $min && $val <= 100000000.0;
    }

    /**
     * Verify Anti-CSRF Token
     */
    public static function verifyCsrf(): bool {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? null;
        if (empty($token) || empty($_SESSION['csrf_token'])) {
            return false;
        }
        return hash_equals($_SESSION['csrf_token'], $token);
    }

    /**
     * Strict verification and storage of uploaded receipt screenshots
     * Validates binary headers, MIME type, file size and stores outside PHP script path
     */
    public static function storeReceiptUpload(array $file): string {
        if (!isset($file['error']) || is_array($file['error'])) {
            throw new InvalidArgumentException("معاملات الملف غير صالحة.");
        }

        switch ($file['error']) {
            case UPLOAD_ERR_OK:
                break;
            case UPLOAD_ERR_NO_FILE:
                throw new InvalidArgumentException("يرجى إرفاق صورة إشعار التحويل المالي.");
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                throw new InvalidArgumentException("حجم الصورة كبير جداً. الحد الأقصى المسموح 5 ميجابايت.");
            default:
                throw new InvalidArgumentException("حدث خطأ غير متوقع أثناء رفع الملف.");
        }

        // Limit size to 5MB
        if ($file['size'] > 5 * 1024 * 1024) {
            throw new InvalidArgumentException("حجم الصورة يتجاوز الحد المسموح به (5 ميجابايت).");
        }

        // Validate real binary MIME type via finfo
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        $allowedMimes = [
            'image/jpeg' => 'jpg',
            'image/jpg'  => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp'
        ];

        if (!array_key_exists($mimeType, $allowedMimes)) {
            throw new InvalidArgumentException("صيغة الملف غير مدعومة. يسمح فقط بالصور المعتمدة بصيغة JPG أو PNG أو WEBP.");
        }

        // Validate image integrity with getimagesize
        $imageInfo = @getimagesize($file['tmp_name']);
        if ($imageInfo === false) {
            throw new InvalidArgumentException("الملف المرفوع تالف أو ليس صورة حقيقية صالحة.");
        }

        // Anti-Webshell Scan: Check for embedded PHP payloads or tags
        $fileContents = file_get_contents($file['tmp_name'], false, null, 0, 8192);
        if ($fileContents !== false && (preg_match('/<\?php|<\?=|<script/i', $fileContents))) {
            throw new InvalidArgumentException("تم رفض الملف لأسباب أمنية (تم اكتشاف كود تنفيذي داخل الصورة).");
        }

        $extension = $allowedMimes[$mimeType];
        
        // Generate cryptographically unguessable filename (strictly enforces single safe extension)
        $randomHash = bin2hex(random_bytes(16));
        $newFilename = "receipt_" . date('Ymd_His') . "_{$randomHash}.{$extension}";

        $destinationDir = UPLOADS_PATH;
        if (!is_dir($destinationDir)) {
            mkdir($destinationDir, 0755, true);
        }

        $destination = $destinationDir . DIRECTORY_SEPARATOR . $newFilename;
        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            throw new RuntimeException("فشل حفظ الملف على الخادم.");
        }

        return 'uploads/receipts/' . $newFilename;
    }
}

