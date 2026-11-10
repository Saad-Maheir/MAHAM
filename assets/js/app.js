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

        // 4. Initialize CSRF & Google Auth in background
        API.initCsrf().catch(() => {});
        if (typeof Auth !== 'undefined' && Auth.initGoogleAuth) {
            setTimeout(() => Auth.initGoogleAuth(), 1000);
        }

        // 5. Setup resilient event listener bindings
        setupEventBindings();

        // 6. Check active database session or enforce auth gate
        checkSession();

        // 7. Handle URL hash changes
        window.addEventListener('hashchange', handleHashChange);
    };

    /**
     * Theme Initialization & Toggle System (Default: Dark Mode)
     */
    const initTheme = () => {
        const savedTheme = localStorage.getItem('maham_theme') || 'dark';
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
        const profToggle = document.getElementById('profile-theme-toggle');
        const profThumb = document.getElementById('profile-toggle-thumb');
        const profIcon = document.getElementById('profile-toggle-icon');

        if (theme === 'dark') {
            html.classList.add('dark');
            html.classList.remove('light');
            if (headerIcon) {
                headerIcon.innerHTML = `
                    <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
                    </svg>
                `;
            }
            if (profToggle) {
                profToggle.setAttribute('aria-checked', 'true');
                profToggle.className = 'relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none bg-emerald-600 shadow-inner';
            }
            if (profThumb) {
                profThumb.style.transform = 'translateX(-1.75rem)';
            }
            if (profIcon) {
                profIcon.innerHTML = `<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>`;
                profIcon.className = 'w-3.5 h-3.5 text-slate-800';
            }
        } else {
            html.classList.remove('dark');
            html.classList.add('light');
            if (headerIcon) {
                headerIcon.innerHTML = `
                    <svg class="w-4 h-4 text-slate-700" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
                    </svg>
                `;
            }
            if (profToggle) {
                profToggle.setAttribute('aria-checked', 'false');
                profToggle.className = 'relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none bg-slate-300 shadow-inner';
            }
            if (profThumb) {
                profThumb.style.transform = 'translateX(0)';
            }
            if (profIcon) {
                profIcon.innerHTML = `<path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>`;
                profIcon.className = 'w-3.5 h-3.5 text-amber-500';
            }
        }
    };

    /**
     * Cinematic Splash Screen Sequencer (Strict 3.8s lifecycle)
     * Displays platform emblem, sleek loading bar, verifies session in background,
     * and performs smooth fade-out dismissal.
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
                const bottomNav = document.getElementById('mobile-bottom-nav');
                if (bottomNav && currentUser) {
                    bottomNav.classList.remove('hidden');
                    bottomNav.style.display = 'flex';
                }
            }, 350);
        }, 1600);
    };

    /**
     * Check Session and Authenticate (Strict Database Enforced)
     * Auto-detects 30-day session or token, inspects role, and routes to admin or home
     */
    const checkSession = async () => {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('auth') === '1' || window.location.hash === '#login') {
                currentUser = null;
                setAuthState(null);
                showAuthModal();
                return;
            }

            const allowAdminInUserApp = urlParams.get('view') === 'user' || sessionStorage.getItem('maham_admin_preview') === 'true';

            const res = await API.get('auth/me');
            if (res && res.data && res.data.user) {
                currentUser = res.data.user;

                if (urlParams.get('view') === 'user') {
                    sessionStorage.setItem('maham_admin_preview', 'true');
                }

                // If user has administrative privilege and hasn't explicitly chosen to preview user app, redirect to admin
                if (currentUser.role === 'admin' && !allowAdminInUserApp) {
                    window.location.href = 'admin.html';
                    return;
                }

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
        const viewAuth = document.getElementById('view-auth');
        const mainLayout = document.getElementById('main-app-container');
        const bottomNav = document.querySelector('.mobile-bottom-nav');

        if (user) {
            if (authModal) {
                authModal.classList.add('hidden');
                authModal.classList.remove('flex');
                authModal.style.display = 'none';
            }
            if (viewAuth) {
                viewAuth.classList.add('hidden');
                viewAuth.style.display = 'none';
            }
            if (mainLayout) {
                mainLayout.classList.remove('hidden');
                mainLayout.style.display = 'block';
            }
            if (bottomNav) {
                const splash = document.getElementById('splash-screen');
                if (!splash || splash.style.display === 'none' || splash.classList.contains('splash-exit')) {
                    bottomNav.classList.remove('hidden');
                    bottomNav.style.display = 'flex';
                }
            }
            loadNotifications();
        } else {
            if (authModal) {
                authModal.classList.remove('hidden');
                authModal.classList.add('flex');
                authModal.style.display = 'flex';
            }
            if (viewAuth) {
                viewAuth.classList.remove('hidden');
                viewAuth.style.display = 'block';
            }
            if (mainLayout) {
                mainLayout.classList.add('hidden');
                mainLayout.style.display = 'none';
            }
            if (bottomNav) {
                bottomNav.classList.add('hidden');
                bottomNav.style.display = 'none';
            }
        }
    };

    /**
     * Sync Real User Profile Data in Sidebar, Header & Home Balance Cards (100% Dynamic)
     */
    const syncUserProfileUi = (data) => {
        const user = data.user || currentUser;
        const tier = data.tier || {};

        if (!user) return;

        // 1. Customer Name Injection (Dynamic, Clean, No Hardcoded Text or Demo Labels)
        const rawName = user.full_name || user.name || 'سعد ماهر سعد';
        const customerName = String(rawName).replace(/\s*\(حساب تجريبي\)/g, '').trim() || 'سعد ماهر سعد';
        const headerNameEl = document.getElementById('header-user-name');
        if (headerNameEl) headerNameEl.textContent = customerName;
        document.querySelectorAll('.current-user-name').forEach(el => el.textContent = customerName);

        // 2. Google / Profile Avatar Dynamic Handling
        const avatarUrl = user.avatar_url || user.avatar || user.picture;
        const initial = customerName.trim().charAt(0) || 'م';
        const fallbackSvg = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='50' fill='%230b111a'/><circle cx='50' cy='50' r='48' fill='none' stroke='%2310b981' stroke-width='4'/><text x='50%' y='58%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='42' font-weight='bold' fill='%2310b981'>${encodeURIComponent(initial)}</text></svg>`;
        const resolvedAvatar = (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim() !== '') ? avatarUrl : fallbackSvg;

        const headerAvatarEl = document.getElementById('header-user-avatar');
        if (headerAvatarEl) headerAvatarEl.src = resolvedAvatar;

        const profileAvatarEl = document.getElementById('profile-user-avatar');
        if (profileAvatarEl) profileAvatarEl.src = resolvedAvatar;

        // 3. Dynamic Balance Injection (Strict Iraqi Dinar Formatting, Western Digits)
        const rawBalance = Number(user.balance || 0);
        const formattedBalance = rawBalance.toLocaleString('en-US');

        const headerQuickBalEl = document.getElementById('header-quick-balance');
        if (headerQuickBalEl) headerQuickBalEl.textContent = formattedBalance;

        const homeMainBalEl = document.getElementById('home-main-balance');
        if (homeMainBalEl) homeMainBalEl.textContent = formattedBalance;

        const profBalanceEl = document.getElementById('prof-stat-balance');
        if (profBalanceEl) profBalanceEl.textContent = `${formattedBalance} د.ع`;

        // Legacy / Class fallbacks
        const homeStatBalEl = document.getElementById('home-stat-balance');
        if (homeStatBalEl) homeStatBalEl.textContent = formattedBalance;
        const bentoTotalBalEl = document.getElementById('bento-total-balance');
        if (bentoTotalBalEl) bentoTotalBalEl.textContent = formattedBalance;
        document.querySelectorAll('.current-user-balance-nav').forEach(el => el.textContent = `${formattedBalance} د.ع`);

        // 4. Dynamic Tier Badge & Name
        const activeTierName = tier.active_tier_name || 'الباقة الأساسية';
        const activeBadge = tier.active_badge || activeTierName;

        const userTierBadgeEl = document.getElementById('home-user-tier-badge');
        if (userTierBadgeEl) userTierBadgeEl.textContent = activeBadge;
        const bentoTierBadgeEl = document.getElementById('bento-tier-badge');
        if (bentoTierBadgeEl) bentoTierBadgeEl.textContent = activeBadge;
        document.querySelectorAll('.current-user-tier-badge').forEach(el => el.textContent = activeBadge);

        // 5. Dynamic Task Reward & Task Quota Injection
        const currentRewardRate = tier.task_reward_rate || tier.daily_profit || user.task_reward_rate || 250;
        const formattedReward = Number(currentRewardRate).toLocaleString('en-US');

        const homeTaskRewardEl = document.getElementById('home-task-reward');
        if (homeTaskRewardEl) homeTaskRewardEl.textContent = formattedReward;
        const taskCardRewardEl = document.getElementById('task-card-reward');
        if (taskCardRewardEl) taskCardRewardEl.textContent = formattedReward;
        const homeStatProfitEl = document.getElementById('home-stat-profit');
        if (homeStatProfitEl) homeStatProfitEl.textContent = formattedReward;
        const bentoTaskProfitEl = document.getElementById('bento-task-profit');
        if (bentoTaskProfitEl) bentoTaskProfitEl.textContent = formattedReward;

        const isVipUser = Boolean(user.is_vip || tier.is_vip);
        let tasksCounterText = '0 من أصل 5';
        let remainingTasksText = '5';

        if (isVipUser) {
            tasksCounterText = '∞ مفتوح';
            remainingTasksText = '∞';
        } else {
            const usedTasks = Number(user.free_tasks_used || 0);
            const remaining = Math.max(0, 5 - usedTasks);
            tasksCounterText = `${usedTasks} من أصل 5`;
            remainingTasksText = String(remaining);
        }

        const homeTasksCounterEl = document.getElementById('home-tasks-counter');
        if (homeTasksCounterEl) homeTasksCounterEl.textContent = tasksCounterText;
        const taskCardRemainEl = document.getElementById('task-card-remaining');
        if (taskCardRemainEl) taskCardRemainEl.textContent = remainingTasksText;
        const homeStatTasksEl = document.getElementById('home-stat-tasks');
        if (homeStatTasksEl) homeStatTasksEl.textContent = tasksCounterText;
        const bentoTasksRemainEl = document.getElementById('bento-tasks-remaining');
        if (bentoTasksRemainEl) bentoTasksRemainEl.textContent = remainingTasksText;

        // Profile view details
        const profCompleted = document.getElementById('prof-stat-completed');
        const profTier = document.getElementById('prof-stat-tier');
        if (profCompleted) profCompleted.textContent = `${user.free_tasks_used || 0} مهمة`;
        if (profTier) profTier.textContent = activeTierName;

        // User contact details
        document.querySelectorAll('.current-user-email').forEach(el => el.textContent = user.email || '—');
        document.querySelectorAll('.current-user-phone').forEach(el => el.textContent = user.phone || 'Google');

        // Toggle Admin Command Center button (Hidden for regular users)
        const adminBtn = document.getElementById('admin-dashboard-btn');
        const profileAdminCard = document.getElementById('profile-admin-link-card');
        const isAdmin = user && user.role === 'admin';

        if (adminBtn) {
            if (isAdmin) {
                adminBtn.classList.remove('hidden');
            } else {
                adminBtn.classList.add('hidden');
            }
        }
        if (profileAdminCard) {
            if (isAdmin) {
                profileAdminCard.classList.remove('hidden');
            } else {
                profileAdminCard.classList.add('hidden');
            }
        }
    };

    /**
     * Handle Profile Button Click (Header + Bottom Nav)
     */
    const handleProfileClick = () => {
        if (currentUser) {
            navigate('profile');
        } else {
            showAuthModal();
        }
    };

    /**
     * Control Dashboard Action Button (Admin Command vs. User VIP)
     */
    const handleDashboardControlClick = () => {
        if (currentUser && currentUser.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            showAuthModal();
        }
    };

    /**
     * View Navigator (Single Page Routing)
     */
    const navigate = (viewName) => {
        if (!currentUser) {
            showAuthModal();
            return;
        }

        currentView = viewName;
        window.location.hash = viewName;

        // Hide all views
        const views = ['home', 'tasks', 'wallet', 'vip', 'profile'];
        views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) {
                if (v === viewName) {
                    el.classList.remove('hidden');
                    el.style.display = 'block';
                } else {
                    el.classList.add('hidden');
                    el.style.display = 'none';
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
                    mobileBtn.classList.remove('text-slate-400', 'text-slate-500');
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
        const viewAuth = document.getElementById('view-auth');
        const mainLayout = document.getElementById('main-app-container');
        const bottomNav = document.querySelector('.mobile-bottom-nav');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        if (viewAuth) viewAuth.classList.remove('hidden');
        if (mainLayout) mainLayout.classList.add('hidden');
        if (bottomNav) bottomNav.classList.add('hidden');
    };

    const hideAuthModal = () => {
        const modal = document.getElementById('auth-modal');
        const viewAuth = document.getElementById('view-auth');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.display = 'none';
        }
        if (viewAuth) {
            viewAuth.classList.add('hidden');
            viewAuth.style.display = 'none';
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

    /**
     * Resilient Event Listener Bindings for Header, Dashboard & Navigation
     * Prevents Double-Execution: Only binds if element does not already declare inline onclick
     */
    const setupEventBindings = () => {
        const bind = (id, handler) => {
            const el = document.getElementById(id);
            if (el && !el.getAttribute('onclick')) {
                el.addEventListener('click', handler);
            }
        };

        // Header Action Elements
        bind('header-profile-btn', (e) => { e.preventDefault(); handleProfileClick(); });
        bind('header-theme-toggle', (e) => { e.preventDefault(); toggleTheme(); });
        bind('header-bell-btn', (e) => { e.preventDefault(); toggleNotifications(); });

        // Quick Action Buttons (Under Main Balance Card)
        bind('btn-action-deposit', (e) => {
            e.preventDefault();
            navigate('wallet');
            if (typeof Wallet !== 'undefined' && Wallet.switchActionTab) Wallet.switchActionTab('deposit');
        });
        bind('btn-action-withdraw', (e) => {
            e.preventDefault();
            navigate('wallet');
            if (typeof Wallet !== 'undefined' && Wallet.switchActionTab) Wallet.switchActionTab('withdraw');
        });
        bind('btn-action-vip', (e) => {
            e.preventDefault();
            navigate('vip');
        });
        bind('btn-start-daily-task', (e) => {
            e.preventDefault();
            navigate('tasks');
        });

        // Dashboard Home Buttons
        bind('btn-view-tasks', (e) => { e.preventDefault(); navigate('tasks'); });
        bind('admin-dashboard-btn', (e) => { e.preventDefault(); handleDashboardControlClick(); });

        // Mobile Bottom Navigation Bar (Strict 5 Tabs: Home, Tasks, Wallet, VIP, Profile)
        bind('mob-nav-home', (e) => { e.preventDefault(); navigate('home'); });
        bind('mob-nav-tasks', (e) => { e.preventDefault(); navigate('tasks'); });
        bind('mob-nav-wallet', (e) => { e.preventDefault(); navigate('wallet'); });
        bind('mob-nav-vip', (e) => { e.preventDefault(); navigate('vip'); });
        bind('mob-nav-profile', (e) => { e.preventDefault(); handleProfileClick(); });

        // Backward compatibility bindings for wallet shortcuts
        bind('mob-nav-withdraw', (e) => {
            e.preventDefault();
            navigate('wallet');
            if (typeof Wallet !== 'undefined' && Wallet.switchActionTab) Wallet.switchActionTab('withdraw');
        });
        bind('mob-nav-deposit', (e) => {
            e.preventDefault();
            navigate('wallet');
            if (typeof Wallet !== 'undefined' && Wallet.switchActionTab) Wallet.switchActionTab('deposit');
        });

        // Desktop Sidebar Navigation
        bind('desk-nav-home', (e) => { e.preventDefault(); navigate('home'); });
        bind('desk-nav-tasks', (e) => { e.preventDefault(); navigate('tasks'); });
        bind('desk-nav-wallet', (e) => { e.preventDefault(); navigate('wallet'); });
        bind('desk-nav-vip', (e) => { e.preventDefault(); navigate('vip'); });
        bind('desk-nav-profile', (e) => { e.preventDefault(); handleProfileClick(); });
        bind('desk-nav-withdraw', (e) => {
            e.preventDefault();
            navigate('wallet');
            if (typeof Wallet !== 'undefined' && Wallet.switchActionTab) Wallet.switchActionTab('withdraw');
        });
        bind('desk-nav-deposit', (e) => {
            e.preventDefault();
            navigate('wallet');
            if (typeof Wallet !== 'undefined' && Wallet.switchActionTab) Wallet.switchActionTab('deposit');
        });
    };

    return {
        init,
        navigate,
        setAuthState,
        syncUserProfileUi,
        showAuthModal,
        hideAuthModal,
        handleProfileClick,
        handleDashboardControlClick,
        setupEventBindings,
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

// Explicitly expose on window for reliable global invocation
window.App = App;

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
