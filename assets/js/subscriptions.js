/**
 * MAHAM FinTech Platform - VIP Subscriptions & Packages Module
 * High-conversion pricing tiers, balance verification, and deposit handoff
 */

const Subscriptions = (() => {
    let packagesList = [];
    let currentBalance = 0;
    let selectedPackage = null;

    /**
     * Load Packages Catalog and Subscriptions Status
     */
    const load = async () => {
        try {
            const res = await API.get('subscriptions/list');
            packagesList = res.data.packages || [];
            currentBalance = Number(res.data.user_balance || 0);

            renderPackagesGrid(packagesList);
        } catch (err) {
            console.error('Subscriptions load error:', err);
            App.toast(err.message || 'تعذر جلب باقات الاشتراك. يرجى التحقق من اتصال الإنترنت.', 'error');
        }
    };

    /**
     * Render the 5 Official VIP Tiers + Free Tier
     */
    const renderPackagesGrid = (packages) => {
        const container = document.getElementById('subscriptions-grid-container');
        if (!container) return;

        container.innerHTML = packages.map((pkg) => {
            const isFree = pkg.code === 'free';
            const isActive = pkg.is_active_tier;

            const duration = pkg.duration_days || (isFree ? 365 : 30);
            const tasksDisplay = pkg.tasks_display || (isFree ? '5 مهام إجمالاً' : 'مفتوح (∞)');

            let cardBorder = 'border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700';
            let badgeBg = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
            let popularBadge = '';

            // Color scheme based on VIP level
            if (pkg.code === 'vip_3') {
                popularBadge = `
                    <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-[11px] px-3.5 py-0.5 rounded-full shadow-lg shadow-amber-500/30 uppercase tracking-wider">
                        الأكثر طلباً واستثماراً
                    </div>
                `;
                cardBorder = 'border-amber-500/40 shadow-xl shadow-amber-950/20';
                badgeBg = 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30';
            } else if (pkg.code === 'vip_5') {
                cardBorder = 'border-emerald-500/40 shadow-xl shadow-emerald-950/20';
                badgeBg = 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30';
            }

            let buttonHtml = '';
            if (isActive) {
                buttonHtml = `
                    <button disabled class="w-full py-3 px-4 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 font-bold text-sm flex items-center justify-center gap-2 cursor-default">
                        <svg class="w-4 h-4 text-emerald-500 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        باقتك النشطة حالياً
                    </button>
                `;
            } else if (isFree) {
                buttonHtml = `
                    <button disabled class="w-full py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-sm cursor-default">
                        الباقة التأسيسية الممنوحة
                    </button>
                `;
            } else {
                buttonHtml = `
                    <button onclick="Subscriptions.promptSubscribe(${pkg.id})" class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-lg shadow-emerald-950/40 hover:shadow-emerald-900/60 active:scale-98 transition flex items-center justify-center gap-2">
                        <span>اشترك الآن</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                    </button>
                `;
            }

            return `
                <div class="glass-panel p-6 relative flex flex-col justify-between ${cardBorder} transition duration-300">
                    ${popularBadge}
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-4">
                            <span class="px-3 py-1 rounded-full text-xs font-bold ${badgeBg}">
                                ${pkg.badge_name}
                            </span>
                            <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">المدة: ${duration} يوماً</span>
                        </div>

                        <h3 class="text-xl font-black text-slate-900 dark:text-white mb-2">${pkg.name}</h3>
                        <p class="text-xs text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">${pkg.description || 'باقة استثمارية معتمدة لمضاعفة الأرباح اليومية عبر منصة مهام.'}</p>

                        <!-- Price Tag -->
                        <div class="mb-6 p-4 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80">
                            <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">سعر الاشتراك الشهري:</div>
                            <div class="flex items-baseline gap-1">
                                <span class="text-3xl font-black font-mono ${isFree ? 'text-slate-700 dark:text-slate-300' : 'text-emerald-600 dark:text-emerald-400'}">
                                    ${Number(pkg.price).toLocaleString('en-US')}
                                </span>
                                <span class="currency-iqd text-slate-500 dark:text-slate-400 font-bold">د.ع</span>
                            </div>
                        </div>

                        <!-- Feature Specifications -->
                        <div class="space-y-3 mb-6 text-xs text-slate-700 dark:text-slate-300">
                            <div class="flex items-center justify-between py-1.5 border-b border-slate-200 dark:border-slate-800/60">
                                <span class="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <svg class="w-4 h-4 text-emerald-500 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    الربح اليومي الثابت:
                                </span>
                                <span class="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                                    ${Number(pkg.daily_profit).toLocaleString('en-US')} د.ع
                                </span>
                            </div>

                            <div class="flex items-center justify-between py-1.5 border-b border-slate-200 dark:border-slate-800/60">
                                <span class="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <svg class="w-4 h-4 text-emerald-500 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    عدد المهام اليومية:
                                </span>
                                <span class="font-bold ${isFree ? 'text-slate-700 dark:text-slate-300' : 'text-amber-500 dark:text-amber-400 font-mono'}">
                                    ${tasksDisplay}
                                </span>
                            </div>

                            <div class="flex items-center justify-between py-1.5">
                                <span class="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <svg class="w-4 h-4 text-emerald-500 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    نظام التبريد الزمني:
                                </span>
                                <span class="font-bold text-slate-700 dark:text-slate-300">
                                    مهمة يومية كل 24 ساعة
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="pt-4 border-t border-slate-200 dark:border-slate-800/80">
                        ${buttonHtml}
                    </div>
                </div>
            `;
        }).join('');
    };

    /**
     * Prompt Subscription Modal with Balance Verification
     */
    const promptSubscribe = (packageId) => {
        const pkg = packagesList.find(p => p.id === packageId);
        if (!pkg) return;
        selectedPackage = pkg;

        const price = Number(pkg.price);

        if (currentBalance >= price) {
            // Sufficient Balance -> Show Confirm Modal
            openConfirmModal(pkg);
        } else {
            // Insufficient Balance -> Show Handoff Modal
            const missing = price - currentBalance;
            openInsufficientModal(pkg, missing);
        }
    };

    /**
     * Open Confirmation Modal for Sufficient Balance
     */
    const openConfirmModal = (pkg) => {
        const modal = document.getElementById('sub-confirm-modal');
        const nameEl = document.getElementById('sub-modal-pkg-name');
        const priceEl = document.getElementById('sub-modal-pkg-price');
        const balanceEl = document.getElementById('sub-modal-current-balance');
        const remainingEl = document.getElementById('sub-modal-remaining-balance');

        nameEl.textContent = pkg.name;
        priceEl.textContent = `${Number(pkg.price).toLocaleString('en-US')} د.ع`;
        balanceEl.textContent = `${Number(currentBalance).toLocaleString('en-US')} د.ع`;
        remainingEl.textContent = `${Number(currentBalance - pkg.price).toLocaleString('en-US')} د.ع`;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    };

    /**
     * Execute Subscription
     */
    const executeSubscription = async () => {
        if (!selectedPackage) return;

        const confirmBtn = document.getElementById('sub-confirm-submit-btn');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            جاري تفعيل الاشتراك وخصم الرصيد...
        `;

        try {
            const res = await API.post('subscriptions/subscribe', {
                package_id: selectedPackage.id
            });

            App.toast(res.message, 'success');
            closeConfirmModal();
            const meRes = await API.get('auth/me').catch(() => null);
            if (meRes && meRes.data) {
                App.syncUserProfileUi(meRes.data);
            }
            if (typeof Dashboard !== 'undefined' && Dashboard.load) {
                await Dashboard.load();
            }
            App.navigate('home');
        } catch (err) {
            App.toast(err.message, 'error');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `<span>تأكيد الاشتراك وخصم الرصيد</span>`;
        }
    };

    /**
     * Open Insufficient Balance Handoff Modal
     */
    const openInsufficientModal = (pkg, missingAmount) => {
        const modal = document.getElementById('sub-insufficient-modal');
        const nameEl = document.getElementById('sub-ins-pkg-name');
        const priceEl = document.getElementById('sub-ins-pkg-price');
        const balanceEl = document.getElementById('sub-ins-current-balance');
        const missingEl = document.getElementById('sub-ins-missing-amount');

        nameEl.textContent = pkg.name;
        priceEl.textContent = `${Number(pkg.price).toLocaleString('en-US')} د.ع`;
        balanceEl.textContent = `${Number(currentBalance).toLocaleString('en-US')} د.ع`;
        missingEl.textContent = `${Number(missingAmount).toLocaleString('en-US')} د.ع`;

        const depositBtn = document.getElementById('sub-ins-deposit-btn');
        depositBtn.onclick = () => {
            closeInsufficientModal();
            // Switch to Wallet View, choose Deposit, and pre-fill missing difference
            App.navigate('wallet');
            Wallet.switchActionTab('deposit');
            Wallet.setDepositAmount(missingAmount);
            App.toast(`تم تعيين المبلغ المطلوب للإيداع: ${Number(missingAmount).toLocaleString('en-US')} د.ع`, 'info');
        };

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    };

    const closeConfirmModal = () => {
        const modal = document.getElementById('sub-confirm-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    };

    const closeInsufficientModal = () => {
        const modal = document.getElementById('sub-insufficient-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    };

    return {
        load,
        promptSubscribe,
        executeSubscription,
        closeConfirmModal,
        closeInsufficientModal
    };
})();

// Explicitly expose on window for reliable global invocation
window.Subscriptions = Subscriptions;

