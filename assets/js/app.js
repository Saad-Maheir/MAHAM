/**
 * MAHAM FinTech Platform - Master Application Controller
 * Splash Screen Sequencer, Responsive Navigation & View Routing Engine
 */

const App = (() => {
    let currentUser = null;
    let currentView = 'home';

    /**
     * Application Initialization
     */
    const init = () => {
        // 0. Initialize Theme (Default Light Mode)
        initTheme();

        // 1. Kick off cinematic splash screen immediately
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

        // 5. Check active database session or enforce auth gate
        checkSession();

        // 6. Handle URL hash changes
        window.addEventListener('hashchange', handleHashChange);
    };

    /**
     * Theme Initialization & Toggle System (Default: Light Mode)
     */
    const initTheme = () => {
        const savedTheme = localStorage.getItem('maham_theme') || 'light';
        applyTheme(savedTheme);
    };

    const toggleTheme = () => {
        const isDark = document.documentElement.classList.contains('dark');
        const newTheme = isDark ? 'light' : 'dark';
        applyTheme(newTheme);
        localStorage.setItem('maham_theme', newTheme);
        toast(`تم التبديل إلى ${newTheme === 'dark' ? 'الوضع الليلي' : 'الوضع النهاري'} بنجاح.`, 'info');
    };

    const applyTheme = (theme) => {
        const html = document.documentElement;
        const headerIcon = document.getElementById('header-theme-icon');
        const profLabel = document.getElementById('profile-theme-label');
        const profIcon = document.getElementById('profile-theme-icon');

        if (theme === 'dark') {
            html.classList.add('dark');
            if (headerIcon) headerIcon.textContent = '☀️';
            if (profLabel) profLabel.textContent = 'الوضع الليلي';
            if (profIcon) profIcon.textContent = '🌙';
        } else {
            html.classList.remove('dark');
            if (headerIcon) headerIcon.textContent = '🌙';
            if (profLabel) profLabel.textContent = 'الوضع النهاري';
            if (profIcon) profIcon.textContent = '☀️';
        }
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
     * Check Session and Authenticate (Strict Database Enforced)
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
            // Unauthenticated or network error
        }

        // Enforce mandatory full-screen authentication gate
        currentUser = null;
        setAuthState(null);
        showAuthModal();
    };

    /**
     * Set Global Authentication State & Mandatory Gate Control
     */
    const setAuthState = (user) => {
        currentUser = user;
        const authModal = document.getElementById('auth-modal');
        const mainLayout = document.getElementById('main-app-container');
        const bottomNav = document.querySelector('.mobile-bottom-nav');

        if (user) {
            if (authModal) {
                authModal.classList.add('hidden');
                authModal.classList.remove('flex');
            }
            if (mainLayout) mainLayout.classList.remove('hidden');
            if (bottomNav) bottomNav.classList.remove('hidden');
            loadNotifications();
        } else {
            if (authModal) {
                authModal.classList.remove('hidden');
                authModal.classList.add('flex');
            }
            if (mainLayout) mainLayout.classList.add('hidden');
            if (bottomNav) bottomNav.classList.add('hidden');
        }
    };

    /**
     * Sync Real User Profile Data in Sidebar & Header
     */
    const syncUserProfileUi = (data) => {
        const user = data.user || currentUser;
        const tier = data.tier || {};

        if (!user) return;

        const userNameEls = document.querySelectorAll('.current-user-name');
        const userEmailEls = document.querySelectorAll('.current-user-email');
        const userPhoneEls = document.querySelectorAll('.current-user-phone');
        const userBalanceEls = document.querySelectorAll('.current-user-balance-nav');
        const userBadgeEls = document.querySelectorAll('.current-user-tier-badge');

        userNameEls.forEach(el => el.textContent = user.full_name || 'المستخدم');
        userEmailEls.forEach(el => el.textContent = user.email || '—');
        userPhoneEls.forEach(el => el.textContent = user.phone || 'Google');
        userBalanceEls.forEach(el => el.textContent = `${Number(user.balance || 0).toLocaleString('ar-IQ')} د.ع`);
        userBadgeEls.forEach(el => el.textContent = tier.active_badge || 'الباقة الأساسية');

        // Render Profile view details
        const profBalance = document.getElementById('prof-stat-balance');
        const profCompleted = document.getElementById('prof-stat-completed');
        const profTier = document.getElementById('prof-stat-tier');

        if (profBalance) profBalance.textContent = `${Number(user.balance || 0).toLocaleString('ar-IQ')} د.ع`;
        if (profCompleted) profCompleted.textContent = `${user.free_tasks_used || 0} مهمة`;
        if (profTier) profTier.textContent = tier.active_tier_name || 'الباقة الأساسية';
    };

    /**
     * Control Dashboard Action Button (Admin Command vs. User VIP)
     */
    const handleDashboardControlClick = () => {
        if (currentUser && currentUser.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            navigate('vip');
        }
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
                    mobileBtn.classList.add('active', 'text-emerald-600');
                    mobileBtn.classList.remove('text-slate-500');
                } else {
                    mobileBtn.classList.remove('active', 'text-emerald-600');
                    mobileBtn.classList.add('text-slate-500');
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
                        syncUserProfileUi({ user: currentUser, tier: {} });
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
        const mainLayout = document.getElementById('main-app-container');
        const bottomNav = document.querySelector('.mobile-bottom-nav');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        if (mainLayout) mainLayout.classList.add('hidden');
        if (bottomNav) bottomNav.classList.add('hidden');
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

    /**
     * Financial & System Notifications System (Bell 🔔 Engine)
     */
    let notificationsList = [];

    const loadNotifications = async () => {
        if (!currentUser) return;
        try {
            const res = await API.get('notifications/list');
            if (res && res.data) {
                notificationsList = res.data.notifications || [];
                const unreadDot = document.getElementById('header-unread-dot');
                if (unreadDot) {
                    if (res.data.unread_count > 0 && notificationsList.length > 0) {
                        unreadDot.classList.remove('hidden');
                    } else {
                        unreadDot.classList.add('hidden');
                    }
                }
            }
        } catch (e) {
            // Non-blocking
        }
    };

    const toggleNotifications = () => {
        const modal = document.getElementById('notifications-modal');
        if (!modal) return;

        if (modal.classList.contains('hidden')) {
            openNotifications();
        } else {
            closeNotifications();
        }
    };

    const openNotifications = async () => {
        const modal = document.getElementById('notifications-modal');
        const container = document.getElementById('notifications-list-container');
        const unreadDot = document.getElementById('header-unread-dot');

        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        if (unreadDot) unreadDot.classList.add('hidden');

        await loadNotifications();

        if (!container) return;

        if (!notificationsList || notificationsList.length === 0) {
            container.innerHTML = `
                <div class="py-12 text-center">
                    <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-xl">
                        🔔
                    </div>
                    <h4 class="text-sm font-bold text-slate-800 dark:text-white mb-1">لا توجد إشعارات جديدة</h4>
                    <p class="text-xs text-slate-500">ستصلك هنا إشعارات فورية عند تأكيد السحب أو الإيداع واعتماد العمليات.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = notificationsList.map(n => {
            const isSuccess = n.type === 'success';
            const iconSvg = isSuccess ? `
                <div class="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                </div>
            ` : `
                <div class="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center shrink-0">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </div>
            `;

            return `
                <div class="p-3.5 rounded-2xl border ${isSuccess ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'} flex items-start gap-3 transition">
                    ${iconSvg}
                    <div class="flex-1 text-right">
                        <div class="flex items-center justify-between mb-1">
                            <h5 class="text-xs font-bold ${isSuccess ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${n.title}</h5>
                            <span class="text-[10px] text-slate-400 font-mono">${n.timestamp ? n.timestamp.substring(0, 16) : ''}</span>
                        </div>
                        <p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">${n.message}</p>
                    </div>
                </div>
            `;
        }).join('');
    };

    const closeNotifications = () => {
        const modal = document.getElementById('notifications-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    };

    return {
        init,
        navigate,
        setAuthState,
        syncUserProfileUi,
        showAuthModal,
        hideAuthModal,
        handleDashboardControlClick,
        toast,
        initTheme,
        toggleTheme,
        loadNotifications,
        toggleNotifications,
        openNotifications,
        closeNotifications,
        getCurrentUser: () => currentUser
    };
})();

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
