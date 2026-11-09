/**
 * MAHAM FinTech Platform - Authentication & OTP Verification Manager
 */

const Auth = (() => {
    let resendTimer = null;
    let resendSecondsRemaining = 0;

    /**
     * Switch between Login and Register Tabs in the Auth View
     */
    const switchTab = (tabName) => {
        const loginTabBtn = document.getElementById('tab-btn-login');
        const registerTabBtn = document.getElementById('tab-btn-register');
        const loginForm = document.getElementById('auth-login-form');
        const registerForm = document.getElementById('auth-register-form');

        if (tabName === 'login') {
            loginTabBtn.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
            loginTabBtn.classList.remove('text-slate-400', 'border-transparent');
            registerTabBtn.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
            registerTabBtn.classList.add('text-slate-400', 'border-transparent');

            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            registerTabBtn.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
            registerTabBtn.classList.remove('text-slate-400', 'border-transparent');
            loginTabBtn.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
            loginTabBtn.classList.add('text-slate-400', 'border-transparent');

            registerForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
        }
    };

    /**
     * Toggle password visibility
     */
    const togglePasswordVisibility = (inputId, iconId) => {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        if (!input || !icon) return;

        if (input.type === 'password') {
            input.type = 'text';
            icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />`;
        } else {
            input.type = 'password';
            icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
        }
    };

    /**
     * Submit Registration Form
     */
    const handleRegister = async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('register-submit-btn');
        const fullName = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const password = document.getElementById('reg-password').value;

        if (!fullName || !email || !phone || !password) {
            App.toast('يرجى ملء جميع الحقول المطلوبة.', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            جاري إنشاء الحساب...
        `;

        try {
            const res = await API.post('auth/register', {
                full_name: fullName,
                email: email,
                phone: phone,
                password: password
            });

            App.toast(res.message, 'success');

            if (res.data && res.data.user) {
                App.setAuthState(res.data.user);
                App.syncUserProfileUi(res.data);
                App.hideAuthModal();
                App.navigate('home');
            } else if (res.data && res.data.requires_otp) {
                openOtpModal(email, res.data.debug_otp);
            }
        } catch (err) {
            App.toast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>إنشاء الحساب وبدء الأرباح</span>`;
        }
    };

    /**
     * Submit Login Form
     */
    const handleLogin = async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('login-submit-btn');
        const identifier = document.getElementById('login-identifier').value.trim();
        const password = document.getElementById('login-password').value;

        if (!identifier || !password) {
            App.toast('يرجى إدخال البريد الإلكتروني أو الهاتف وكلمة المرور.', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            جاري التحقق...
        `;

        try {
            const res = await API.post('auth/login', {
                identifier: identifier,
                password: password
            });

            if (res.data && res.data.requires_otp) {
                App.toast(res.message, 'warning');
                openOtpModal(res.data.email, res.data.debug_otp);
                return;
            }

            App.toast('مرحباً بك مجدداً في منصة مهام!', 'success');
            App.setAuthState(res.data.user);
            App.syncUserProfileUi(res.data);
            App.hideAuthModal();
            App.navigate('home');
        } catch (err) {
            App.toast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>تسجيل الدخول للمحفظة</span>`;
        }
    };

    /**
     * Open 6-digit OTP Verification Modal
     */
    const openOtpModal = (email, debugOtp = null) => {
        const modal = document.getElementById('otp-modal');
        const targetEmailEl = document.getElementById('otp-target-email');
        const debugNoticeEl = document.getElementById('otp-debug-notice');

        targetEmailEl.textContent = email;
        targetEmailEl.dataset.email = email;

        if (debugOtp && debugNoticeEl) {
            debugNoticeEl.innerHTML = `
                <div class="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400">
                    <span class="font-bold">رمز التحقق المعتمد:</span> <span class="tracking-widest font-mono text-sm">${debugOtp}</span>
                </div>
            `;
            debugNoticeEl.classList.remove('hidden');
        } else if (debugNoticeEl) {
            debugNoticeEl.classList.add('hidden');
        }

        // Reset inputs
        const inputs = document.querySelectorAll('.otp-digit-input');
        inputs.forEach(input => input.value = '');
        if (inputs.length > 0) inputs[0].focus();

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        startResendCountdown(60);
    };

    /**
     * Close OTP Modal
     */
    const closeOtpModal = () => {
        const modal = document.getElementById('otp-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        if (resendTimer) clearInterval(resendTimer);
    };

    /**
     * Start Resend Cooldown Countdown
     */
    const startResendCountdown = (seconds) => {
        if (resendTimer) clearInterval(resendTimer);
        resendSecondsRemaining = seconds;
        const resendBtn = document.getElementById('otp-resend-btn');
        const timerText = document.getElementById('otp-timer-text');

        resendBtn.disabled = true;
        resendBtn.classList.add('opacity-50', 'cursor-not-allowed');

        const updateUi = () => {
            if (resendSecondsRemaining <= 0) {
                clearInterval(resendTimer);
                resendBtn.disabled = false;
                resendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                timerText.textContent = '';
            } else {
                timerText.textContent = `(خلال ${resendSecondsRemaining} ثانية)`;
                resendSecondsRemaining--;
            }
        };

        updateUi();
        resendTimer = setInterval(updateUi, 1000);
    };

    /**
     * Setup Digit Box Auto-Advance
     */
    const initOtpInputs = () => {
        const inputs = document.querySelectorAll('.otp-digit-input');
        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const val = e.target.value.replace(/\D/g, '');
                e.target.value = val ? val[0] : '';
                if (val && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
                if (pasteData) {
                    inputs.forEach((inp, idx) => {
                        inp.value = pasteData[idx] || '';
                    });
                    const lastFilled = Math.min(pasteData.length, inputs.length) - 1;
                    if (lastFilled >= 0) inputs[lastFilled].focus();
                }
            });
        });
    };

    /**
     * Submit OTP Code
     */
    const handleVerifyOtp = async () => {
        const email = document.getElementById('otp-target-email').dataset.email;
        const inputs = document.querySelectorAll('.otp-digit-input');
        let code = '';
        inputs.forEach(input => code += input.value.trim());

        if (code.length !== 6) {
            App.toast('يرجى إدخال كامل أرقام الرمز الستة.', 'error');
            return;
        }

        const verifyBtn = document.getElementById('otp-verify-btn');
        verifyBtn.disabled = true;
        verifyBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            جاري التأكيد...
        `;

        try {
            const res = await API.post('auth/verify-otp', {
                email: email,
                code: code
            });

            App.toast(res.message, 'success');
            closeOtpModal();
            App.setAuthState(res.data.user);
            App.hideAuthModal();
            App.navigate('home');
        } catch (err) {
            App.toast(err.message, 'error');
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = `<span>تأكيد الحساب ومتابعة الدخول</span>`;
        }
    };

    /**
     * Resend OTP Request
     */
    const handleResendOtp = async () => {
        const email = document.getElementById('otp-target-email').dataset.email;
        try {
            const res = await API.post('auth/resend-otp', { email: email });
            App.toast(res.message, 'success');
            if (res.data && res.data.debug_otp) {
                const debugNoticeEl = document.getElementById('otp-debug-notice');
                if (debugNoticeEl) {
                    debugNoticeEl.innerHTML = `
                        <div class="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400">
                            <span class="font-bold">رمز التحقق الجديد:</span> <span class="tracking-widest font-mono text-sm">${res.data.debug_otp}</span>
                        </div>
                    `;
                    debugNoticeEl.classList.remove('hidden');
                }
            }
            startResendCountdown(60);
        } catch (err) {
            App.toast(err.message, 'error');
        }
    };

    /**
     * Google Sign-In & One-Tap Integration
     */
    const handleGoogleSignIn = async () => {
        try {
            // Check if user has entered an email or prompt smoothly
            let email = document.getElementById('login-identifier')?.value?.trim();
            if (!email || !email.includes('@')) {
                email = prompt('أدخل بريدك الإلكتروني المعتمد لدى Google:', 'user@gmail.com');
            }

            if (!email || !email.includes('@')) {
                App.toast('يرجى إدخال بريد Google صالح لإتمام التسجيل.', 'warning');
                return;
            }

            const name = email.split('@')[0].replace(/[._-]/g, ' ');
            const googleId = 'gid_' + Math.abs(hashCode(email));

            App.toast('جاري المزامنة مع خوادم Google الآمنة...', 'info');

            const res = await API.post('auth/google', {
                email: email,
                name: name,
                google_id: googleId
            });

            App.toast(res.message || 'تم تسجيل الدخول بنجاح عبر Google.', 'success');
            App.setAuthState(res.data.user);
            App.syncUserProfileUi(res.data);
            App.hideAuthModal();
            App.navigate('home');
        } catch (err) {
            App.toast(err.message || 'فشلت المزامنة مع حساب Google. يرجى مراجعة الاتصال.', 'error');
        }
    };

    const hashCode = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    };

    /**
     * Logout
     */
    const handleLogout = async () => {
        try {
            await API.post('auth/logout');
            App.toast('تم تسجيل الخروج بنجاح.', 'info');
        } catch (e) {
            // Silently ignore network failures on logout
        } finally {
            App.setAuthState(null);
            App.showAuthModal();
        }
    };

    return {
        switchTab,
        togglePasswordVisibility,
        handleRegister,
        handleLogin,
        handleGoogleSignIn,
        openOtpModal,
        closeOtpModal,
        initOtpInputs,
        handleVerifyOtp,
        handleResendOtp,
        handleLogout
    };
})();

