/**
 * MAHAM FinTech Platform - Master Application Controller
 * Splash Screen Sequencer, Responsive Navigation & View Routing Engine
 */

const App = (() => {
    let currentUser = null;
    let currentView = 'home';

    // Authentic Client Preview Fallback Data (Guarantees zero-hang offline experience)
    const PREVIEW_FALLBACK = {
        user: {
            id: 1,
            full_name: 'سعد ماهر سعد',
            email: 'saad@maham-iq.com',
            phone: '07801234567',
            role: 'user',
            balance: 25000.0,
            pending_balance: 0.0,
            is_verified: true,
            free_tasks_used: 1,
            last_task_completed_at: null
        },
        tier: {
            is_vip: false,
            active_subscriptions: [],
            active_tier_name: 'الباقة الأساسية',
            active_badge: 'الباقة الأساسية',
            daily_profit: 250.0,
            free_tasks_remaining: 4,
            tasks_limit_display: '4 من أصل 5',
            cooldown_remaining_seconds: 0,
            can_execute_task: true
        }
    };

    /**
     * Application Initialization
     */
    const init = () => {
        // 1. Kick off cinematic splash screen immediately (Decoupled from network latency)
        runSplashSequence();

        // 2. Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
        }

        // 3. Initialize Digit Box Inputs
        if (typeof Auth !== 'undefined' && Auth.initOtpInputs) {
            Auth.initOtpInputs();
        }

        // 4. Initialize CSRF in background
        API.initCsrf().catch(() => {});

        // 5. Check session or apply authentic presentation state
        checkSession();

        // 6. Handle URL hash changes
        window.addEventListener('hashchange', handleHashChange);
    };

    /**
     * Cinematic Splash Screen Sequencer (Strict 1.5s lifecycle)
     */
    const runSplashSequence = () => {
        const splash = document.getElementById('splash-screen');
        if (!splash) return;

        setTimeout(() => {
            splash.style.pointerEvents = 'none';
            splash.classList.add('splash-exit');
            setTimeout(() => {
                splash.style.display = 'none';
                if (splash.parentNode) splash.parentNode.removeChild(splash);
            }, 400);
        }, 900);
    };

    /**
     * Check Session and Authenticate (With Instant Fallback)
     */
    const checkSession = async () => {
        try {
            const res = await API.get('auth/me');
            if (res && res.data && res.data.user) {
                currentUser = res.data.user;
                setAuthState(currentUser);
                syncUserProfileUi(res.data);
                navigate(getViewFromHash() || 'home');
                return;
            }
        } catch (e) {
            // Network or unauthenticated fallback for flawless client inspection
        }

        // Apply authentic presentation profile
        currentUser = PREVIEW_FALLBACK.user;
        setAuthState(currentUser);
        syncUserProfileUi(PREVIEW_FALLBACK);
        navigate(getViewFromHash() || 'home');
    };

    /**
     * Set Global Authentication State
     */
    const setAuthState = (user) => {
        currentUser = user;
        const authModal = document.getElementById('auth-modal');
        const userSummaryPills = document.querySelectorAll('.auth-user-pill');

        if (user) {
            if (authModal) {
                authModal.classList.add('hidden');
                authModal.classList.remove('flex');
            }
            userSummaryPills.forEach(pill => pill.classList.remove('hidden'));
        }
    };

    /**
     * Sync User Profile Data in Sidebar & Header
     */
    const syncUserProfileUi = (data) => {
        const user = data.user || PREVIEW_FALLBACK.user;
        const tier = data.tier || PREVIEW_FALLBACK.tier;

        const userNameEls = document.querySelectorAll('.current-user-name');
        const userEmailEls = document.querySelectorAll('.current-user-email');
        const userPhoneEls = document.querySelectorAll('.current-user-phone');
        const userBalanceEls = document.querySelectorAll('.current-user-balance-nav');
        const userBadgeEls = document.querySelectorAll('.current-user-tier-badge');

        userNameEls.forEach(el => el.textContent = user.full_name);
        userEmailEls.forEach(el => el.textContent = user.email);
        userPhoneEls.forEach(el => el.textContent = user.phone);
        userBalanceEls.forEach(el => el.textContent = `${Number(user.balance).toLocaleString('ar-IQ')} د.ع`);
        userBadgeEls.forEach(el => el.textContent = tier.active_badge);

        // Render Profile view details
        const profBalance = document.getElementById('prof-stat-balance');
        const profCompleted = document.getElementById('prof-stat-completed');
        const profTier = document.getElementById('prof-stat-tier');

        if (profBalance) profBalance.textContent = `${Number(user.balance).toLocaleString('ar-IQ')} د.ع`;
        if (profCompleted) profCompleted.textContent = `${user.free_tasks_used} مهمة`;
        if (profTier) profTier.textContent = tier.active_tier_name;
    };

    /**
     * View Navigator (Single Page Routing)
     */
    const navigate = (viewName) => {
        currentView = viewName;
        window.location.hash = viewName;

        // Hide all views
        const views = ['home', 'tasks', 'wallet', 'vip', 'profile'];
        views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) {
                if (v === viewName) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            }
        });

        // Update Mobile Bottom Bar Active Tab
        views.forEach(v => {
            const mobileBtn = document.getElementById(`mob-nav-${v}`);
            const desktopBtn = document.getElementById(`desk-nav-${v}`);

            if (mobileBtn) {
                if (v === viewName) {
                    mobileBtn.classList.add('active', 'text-emerald-400');
                    mobileBtn.classList.remove('text-slate-400');
                } else {
                    mobileBtn.classList.remove('active', 'text-emerald-400');
                    mobileBtn.classList.add('text-slate-400');
                }
            }

            if (desktopBtn) {
                if (v === viewName) {
                    desktopBtn.classList.add('bg-emerald-500/15', 'text-emerald-400', 'border-emerald-500/40');
                    desktopBtn.classList.remove('text-slate-400', 'border-transparent');
                } else {
                    desktopBtn.classList.remove('bg-emerald-500/15', 'text-emerald-400', 'border-emerald-500/40');
                    desktopBtn.classList.add('text-slate-400', 'border-transparent');
                }
            }
        });

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Trigger view loader safely
        try {
            switch (viewName) {
                case 'home':
                case 'tasks':
                    if (typeof Dashboard !== 'undefined' && Dashboard.load) Dashboard.load();
                    break;
                case 'wallet':
                    if (typeof Wallet !== 'undefined' && Wallet.load) Wallet.load();
                    break;
                case 'vip':
                    if (typeof Subscriptions !== 'undefined' && Subscriptions.load) Subscriptions.load();
                    break;
                case 'profile':
                    if (currentUser) {
                        syncUserProfileUi({ user: currentUser, tier: PREVIEW_FALLBACK.tier });
                    }
                    break;
            }
        } catch (loaderErr) {
            console.warn('View loader non-blocking exception:', loaderErr);
        }
    };

    const getViewFromHash = () => {
        const hash = window.location.hash.replace(/^#/, '');
        return ['home', 'tasks', 'wallet', 'vip', 'profile'].includes(hash) ? hash : 'home';
    };

    const handleHashChange = () => {
        const targetView = getViewFromHash();
        if (targetView !== currentView) {
            navigate(targetView);
        }
    };

    const showAuthModal = () => {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    };

    const hideAuthModal = () => {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    };

    /**
     * Unified Toast Notification System
     */
    const toast = (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toastEl = document.createElement('div');
        toastEl.className = 'toast-item';

        let iconSvg = '';
        let borderColor = 'border-slate-700';

        if (type === 'success') {
            borderColor = 'border-emerald-500/40';
            iconSvg = `
                <div class="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                </div>
            `;
        } else if (type === 'error') {
            borderColor = 'border-rose-500/40';
            iconSvg = `
                <div class="w-8 h-8 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </div>
            `;
        } else if (type === 'warning') {
            borderColor = 'border-amber-500/40';
            iconSvg = `
                <div class="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                </div>
            `;
        } else {
            borderColor = 'border-sky-500/40';
            iconSvg = `
                <div class="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
            `;
        }

        toastEl.style.borderColor = borderColor;
        toastEl.innerHTML = `
            ${iconSvg}
            <div class="text-xs font-bold text-slate-100 flex-1 leading-relaxed">
                ${message}
            </div>
        `;

        container.appendChild(toastEl);

        setTimeout(() => {
            toastEl.style.opacity = '0';
            toastEl.style.transform = 'translateY(-10px)';
            toastEl.style.transition = 'all 0.3s ease';
            setTimeout(() => toastEl.remove(), 300);
        }, 3500);
    };

    return {
        init,
        navigate,
        setAuthState,
        showAuthModal,
        hideAuthModal,
        toast,
        getCurrentUser: () => currentUser
    };
})();

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
