/**
 * MAHAM FinTech Platform - Dashboard & 24-Hour Cooldown Task Engine
 * Manages Bento Metrics, Anti-Cheat 30s Execution Modal, and Live Server Timer
 */

const Dashboard = (() => {
    let cooldownInterval = null;
    let antiCheatInterval = null;
    let activeTaskSession = null;

    /**
     * Load Dashboard Data and Render Interface
     */
    const load = async () => {
        let user = { balance: 0.0 };
        let tier = { active_badge: 'الباقة الأساسية', daily_profit: 250.0, task_reward_rate: 250.0, active_subscriptions_count: 0, active_subscriptions: [] };
        let tasks = [];
        let userState = {
            is_vip: false,
            current_reward_per_task: 250.0,
            free_tasks_remaining: 5,
            free_tasks_used: 0,
            cooldown_remaining_seconds: 0,
            can_execute_task: true,
            completed_task_ids_today: []
        };

        try {
            const [profileRes, tasksRes] = await Promise.all([
                API.get('auth/me').catch(() => null),
                API.get('tasks/list').catch(() => null)
            ]);

            if (profileRes && profileRes.data && profileRes.data.user) {
                user = profileRes.data.user;
                tier = profileRes.data.tier || tier;
            }

            if (tasksRes && tasksRes.data && tasksRes.data.tasks) {
                tasks = tasksRes.data.tasks;
                userState = tasksRes.data.user_state || userState;
            }
        } catch (e) {
            // Unauthenticated or network error handled by App
        }

        renderBentoMetrics(user, tier, userState);
        handleCooldownState(userState, tier);
        renderTasksList(tasks, userState);
    };

    /**
     * Render Hero FinTech Metrics & Bento Cards (100% Dynamic Synchronization)
     */
    const renderBentoMetrics = (user, tier, userState) => {
        const homeMainBalEl    = document.getElementById('home-main-balance');
        const balanceEl        = document.getElementById('home-stat-balance');
        const bentoBalanceEl   = document.getElementById('bento-total-balance');
        const timeEl           = document.getElementById('home-stat-time');
        const timeSubEl        = document.getElementById('home-stat-time-sub');
        const homeTaskRewardEl = document.getElementById('home-task-reward');
        const taskCardRewardEl = document.getElementById('task-card-reward');
        const profitEl         = document.getElementById('home-stat-profit');
        const bentoProfitEl    = document.getElementById('bento-task-profit');
        const tierSubEl        = document.getElementById('home-stat-tier-name');
        const userTierBadgeEl  = document.getElementById('home-user-tier-badge');
        const bentoTierBadge   = document.getElementById('bento-tier-badge');
        const homeTasksCounter = document.getElementById('home-tasks-counter');
        const taskCardRemainEl = document.getElementById('task-card-remaining');
        const tasksEl          = document.getElementById('home-stat-tasks');
        const bentoTasksRemain = document.getElementById('bento-tasks-remaining');
        const bentoAvailTasks  = document.getElementById('bento-available-tasks');
        const tasksSubEl       = document.getElementById('home-stat-tasks-sub');
        const subsCountEl      = document.getElementById('home-subs-count');
        const dailyProfitEl    = document.getElementById('home-daily-profit');

        const isVipUser = Boolean(userState.is_vip || tier.is_vip);

        // 1. Balance (Actual DB Balance)
        const formattedBalance = Number(user.balance || 0).toLocaleString('en-US');
        if (homeMainBalEl) homeMainBalEl.textContent = formattedBalance;
        if (balanceEl) balanceEl.textContent = formattedBalance;
        if (bentoBalanceEl) bentoBalanceEl.textContent = formattedBalance;

        // 2. Time / Cooldown Status Placeholder
        const secondsLeft = (tier.cooldown_remaining_seconds !== undefined) 
            ? tier.cooldown_remaining_seconds 
            : (userState.cooldown_remaining_seconds || 0);

        if (timeEl && secondsLeft <= 0) {
            timeEl.textContent = 'جا هز !';
            timeEl.className = 'text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight';
            if (timeSubEl) timeSubEl.textContent = 'متاح تنفيذ مهام الآن';
        }

        // 3. Task Profit (Cumulative Multi-Tier Rate)
        const currentRewardRate = tier.task_reward_rate || tier.daily_profit || userState.current_reward_per_task || 250;
        const formattedProfit = Number(currentRewardRate).toLocaleString('en-US');
        if (homeTaskRewardEl) homeTaskRewardEl.textContent = formattedProfit;
        if (taskCardRewardEl) taskCardRewardEl.textContent = formattedProfit;
        if (profitEl) profitEl.textContent = formattedProfit;
        if (bentoProfitEl) bentoProfitEl.textContent = formattedProfit;

        // Active Tier Name & Badges
        const tierName = tier.active_tier_name || 'الباقة الأساسية';
        const activeBadge = tier.active_badge || tierName;
        if (tierSubEl) tierSubEl.textContent = tierName;
        if (userTierBadgeEl) userTierBadgeEl.textContent = activeBadge;
        if (bentoTierBadge) bentoTierBadge.textContent = activeBadge;
        document.querySelectorAll('.current-user-tier-badge').forEach(el => el.textContent = activeBadge);

        // 4. Tasks Count
        if (isVipUser) {
            if (homeTasksCounter) homeTasksCounter.textContent = '∞ مفتوح';
            if (taskCardRemainEl) taskCardRemainEl.textContent = '∞';
            if (tasksEl) {
                tasksEl.textContent = '∞';
                tasksEl.className = 'font-bold text-white tracking-tight';
            }
            if (bentoTasksRemain) bentoTasksRemain.textContent = '∞';
            if (bentoAvailTasks) bentoAvailTasks.textContent = '∞ مفتوح';
            if (tasksSubEl) tasksSubEl.textContent = 'مهام يومية مفتوحة';
        } else {
            const usedTasks = Number(user.free_tasks_used || userState.free_tasks_used || 0);
            const remaining = (tier.free_tasks_remaining !== undefined && tier.free_tasks_remaining !== '∞')
                ? tier.free_tasks_remaining
                : (userState.free_tasks_remaining !== undefined ? userState.free_tasks_remaining : Math.max(0, 5 - usedTasks));

            if (homeTasksCounter) homeTasksCounter.textContent = `${usedTasks} من أصل 5`;
            if (taskCardRemainEl) taskCardRemainEl.textContent = String(remaining);
            if (tasksEl) {
                tasksEl.textContent = String(remaining);
            }
            if (bentoTasksRemain) bentoTasksRemain.textContent = String(remaining);
            if (bentoAvailTasks) bentoAvailTasks.textContent = `${remaining} من أصل 5`;
            if (tasksSubEl) tasksSubEl.textContent = 'مهام مجانية متوفرة';
        }

        // Active Subscriptions Box
        const subsCount = (tier.active_subscriptions_count !== undefined)
            ? tier.active_subscriptions_count
            : (tier.active_subscriptions ? tier.active_subscriptions.length : (isVipUser ? 1 : 0));

        if (subsCountEl) {
            subsCountEl.textContent = `${subsCount} باقة`;
        }
        if (dailyProfitEl) {
            const daily = tier.daily_profit || currentRewardRate || 250;
            dailyProfitEl.textContent = `${Number(daily).toLocaleString('en-US')} د.ع`;
        }
    };

    /**
     * Manage 24-Hour Server-Synced Cooldown Display (Applies to both Free & VIP)
     */
    const handleCooldownState = (userState, tier) => {
        if (cooldownInterval) clearInterval(cooldownInterval);

        const timeEl           = document.getElementById('home-stat-time');
        const timeSubEl        = document.getElementById('home-stat-time-sub');
        const cooldownBanner   = document.getElementById('cooldown-banner');
        const cooldownClock    = document.getElementById('cooldown-timer-clock');
        const btnStartDaily    = document.getElementById('btn-start-daily-task');
        const btnStartDailyTxt = document.getElementById('btn-start-daily-task-text');

        let secondsLeft = 0;
        if (tier && tier.cooldown_remaining_seconds !== undefined) {
            secondsLeft = tier.cooldown_remaining_seconds;
        } else if (userState && userState.cooldown_remaining_seconds !== undefined) {
            secondsLeft = userState.cooldown_remaining_seconds;
        }

        if (secondsLeft > 0) {
            if (cooldownBanner) cooldownBanner.classList.remove('hidden');
            if (timeEl) {
                timeEl.className = 'text-2xl sm:text-3xl font-black text-amber-500 font-mono tracking-tight';
            }
            if (timeSubEl) timeSubEl.textContent = 'الوقت المتبقي للمهمة القادمة';

            const updateTimer = () => {
                if (secondsLeft <= 0) {
                    clearInterval(cooldownInterval);
                    if (cooldownBanner) cooldownBanner.classList.add('hidden');
                    if (timeEl) {
                        timeEl.textContent = 'جا هز !';
                        timeEl.className = 'text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight';
                    }
                    if (timeSubEl) timeSubEl.textContent = 'متاح تنفيذ مهام الآن';
                    if (btnStartDaily) {
                        btnStartDaily.disabled = false;
                        btnStartDaily.classList.remove('bg-slate-800', 'text-slate-400', 'cursor-not-allowed');
                        btnStartDaily.classList.add('bg-gradient-to-r', 'from-emerald-600', 'to-teal-600', 'hover:from-emerald-500');
                    }
                    if (btnStartDailyTxt) {
                        btnStartDailyTxt.textContent = 'بدء تنفيذ المهام اليومية (متاح الآن)';
                    }
                    load();
                    return;
                }

                const h = Math.floor(secondsLeft / 3600).toString().padStart(2, '0');
                const m = Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0');
                const s = Math.floor(secondsLeft % 60).toString().padStart(2, '0');
                const clockText = `${h}:${m}:${s}`;

                if (timeEl) timeEl.textContent = clockText;
                if (cooldownClock) cooldownClock.textContent = clockText;
                if (btnStartDaily) {
                    btnStartDaily.disabled = true;
                    btnStartDaily.classList.remove('bg-gradient-to-r', 'from-emerald-600', 'to-teal-600', 'hover:from-emerald-500');
                    btnStartDaily.classList.add('bg-slate-800', 'text-slate-400', 'cursor-not-allowed');
                }
                if (btnStartDailyTxt) {
                    btnStartDailyTxt.textContent = `نظام التبريد نشط (متبقي: ${clockText})`;
                }
                secondsLeft--;
            };

            updateTimer();
            cooldownInterval = setInterval(updateTimer, 1000);
        } else {
            if (cooldownBanner) cooldownBanner.classList.add('hidden');
            if (timeEl) {
                timeEl.textContent = 'جا هز !';
                timeEl.className = 'text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight';
            }
            if (timeSubEl) timeSubEl.textContent = 'متاح تنفيذ مهام الآن';
            if (btnStartDaily) {
                btnStartDaily.disabled = false;
                btnStartDaily.classList.remove('bg-slate-800', 'text-slate-400', 'cursor-not-allowed');
                btnStartDaily.classList.add('bg-gradient-to-r', 'from-emerald-600', 'to-teal-600', 'hover:from-emerald-500');
            }
            if (btnStartDailyTxt) {
                btnStartDailyTxt.textContent = 'بدء تنفيذ المهام اليومية (متاح الآن)';
            }
        }
    };

    let currentTasksCatalog = [];

    /**
     * Render Interactive Task Cards
     */
    const renderTasksList = (tasks, userState) => {
        currentTasksCatalog = tasks || [];
        const containerHome = document.getElementById('tasks-grid-container');
        const containerDedicated = document.getElementById('tasks-dedicated-grid-container');

        if (!tasks || tasks.length === 0) {
            const emptyHtml = `
                <div class="col-span-full p-8 text-center glass-panel rounded-2xl border-dashed border-slate-700">
                    <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-800 flex items-center justify-center text-xl">📋</div>
                    <h4 class="text-sm font-bold text-white mb-1">لا توجد مهام معتمدة حالياً</h4>
                    <p class="text-xs text-slate-400">يقوم المشرف بإضافة وتوجيه المهام اليومية الجديدة. ستظهر مهامك هنا فور اعتمادها.</p>
                </div>
            `;
            if (containerHome) containerHome.innerHTML = emptyHtml;
            if (containerDedicated) containerDedicated.innerHTML = emptyHtml;
            return;
        }

        const canExecute = userState.can_execute_task !== false;
        const completedIds = userState.completed_task_ids_today || [];

        const html = tasks.map((task) => {
            const isCompletedToday = completedIds.includes(Number(task.id));
            const reward = (task.calculated_reward !== undefined) ? Number(task.calculated_reward) : (userState.is_vip ? Number(userState.current_reward_per_task) : Number(task.reward_amount));

            let actionButtonHtml = '';
            if (isCompletedToday) {
                actionButtonHtml = `
                    <button disabled class="w-full py-2.5 px-4 rounded-xl bg-slate-800 text-slate-500 font-semibold text-xs flex items-center justify-center gap-2 cursor-not-allowed">
                        <svg class="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                        تم إنجازها اليوم
                    </button>
                `;
            } else if (!canExecute) {
                actionButtonHtml = `
                    <button disabled class="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 text-slate-400 font-medium text-xs flex items-center justify-center gap-2 cursor-not-allowed border border-slate-700/50">
                        <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                        </svg>
                        مقفل (نظام التبريد نشط)
                    </button>
                `;
            } else {
                actionButtonHtml = `
                    <button onclick="Dashboard.openTaskModal(${task.id})" class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 active:scale-98 transition flex items-center justify-center gap-2">
                        <span>تنفيذ المهمة واستلام</span>
                        <span class="font-mono">${Number(reward).toLocaleString('en-US')} د.ع</span>
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                    </button>
                `;
            }

            const targetBadge = task.target_type === 'specific' ? `
                <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                    مهمة موجهة لك 🎯
                </span>
            ` : '';

            const attachmentHtml = task.attachment_url ? `
                <div class="mb-3">
                    <a href="${task.attachment_url}" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-400 text-[11px] font-semibold transition">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                        </svg>
                        <span>عرض المرفق التوضيحي / الفيديو</span>
                    </a>
                </div>
            ` : '';

            return `
                <div class="glass-panel p-5 relative overflow-hidden flex flex-col justify-between group hover:border-slate-300 dark:hover:border-slate-600 transition">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-3">
                            <div class="flex items-center gap-1.5">
                                <span class="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/25">
                                    مكافأة فورية
                                </span>
                                ${targetBadge}
                            </div>
                            <div class="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-[11px] font-mono">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                <span>${task.required_seconds || 30} ثانية</span>
                            </div>
                        </div>
                        <h4 class="text-sm font-bold text-slate-900 dark:text-white mb-1.5 leading-snug">${task.title}</h4>
                        <p class="text-xs text-slate-600 dark:text-slate-400 mb-3 line-clamp-2 leading-relaxed">${task.description}</p>
                        ${attachmentHtml}
                    </div>
                    <div class="pt-3 border-t border-slate-200 dark:border-slate-800/80">
                        ${actionButtonHtml}
                    </div>
                </div>
            `;
        }).join('');

        if (containerHome) containerHome.innerHTML = html;
        if (containerDedicated) containerDedicated.innerHTML = html;
    };

    /**
     * Open Anti-Cheat Task Execution Modal
     */
    const openTaskModal = async (taskId) => {
        const found = currentTasksCatalog.find(t => Number(t.id) === Number(taskId));
        if (!found) {
            App.toast('المهمة المطلوبة غير متوفرة حالياً.', 'error');
            return;
        }

        let session = null;
        try {
            const res = await API.post('tasks/start', { task_id: Number(taskId) });
            if (res && res.data) {
                session = res.data;
            } else {
                throw new Error(res.message || 'تعذر بدء المهمة.');
            }
        } catch (e) {
            App.toast(e.message || 'نظام التبريد نشط أو تعذر بدء المهمة.', 'error');
            return;
        }

        activeTaskSession = session;

        const modal = document.getElementById('task-execution-modal');
        const titleEl = document.getElementById('task-exec-title');
        const claimBtn = document.getElementById('task-claim-btn');
        const targetLinkBtn = document.getElementById('task-target-link');

        if (titleEl) titleEl.textContent = session.title;
        if (targetLinkBtn) targetLinkBtn.href = session.target_url;

        window.open(session.target_url, '_blank');

        // Lock Claim Button
        if (claimBtn) {
            claimBtn.disabled = true;
            claimBtn.className = 'w-full py-3 px-6 rounded-xl bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center gap-2 transition cursor-not-allowed';
            claimBtn.innerHTML = `
                <svg class="w-4 h-4 text-amber-400 animate-pulse ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                <span>جاري التحقق الأمني من إتمام المهمة...</span>
            `;
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        startAntiCheatTimer(session.required_seconds || 30);
    };

    /**
     * Start Strict 30s Anti-Cheat Timer
     */
    const startAntiCheatTimer = (totalSeconds) => {
        if (antiCheatInterval) clearInterval(antiCheatInterval);

        let remaining = totalSeconds;
        const timerNumber = document.getElementById('task-timer-number');
        const timerCircle = document.getElementById('task-timer-circle');
        const claimBtn = document.getElementById('task-claim-btn');

        const circumference = 2 * Math.PI * 45;
        if (timerCircle) {
            timerCircle.style.strokeDasharray = `${circumference} ${circumference}`;
            timerCircle.style.strokeDashoffset = '0';
        }

        const updateClock = () => {
            if (timerNumber) timerNumber.textContent = remaining;

            if (timerCircle) {
                const offset = circumference - (remaining / totalSeconds) * circumference;
                timerCircle.style.strokeDashoffset = offset;
            }

            if (remaining <= 0) {
                clearInterval(antiCheatInterval);
                if (claimBtn) {
                    claimBtn.disabled = false;
                    claimBtn.className = 'w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition cursor-pointer flex items-center justify-center gap-2';
                    claimBtn.innerHTML = `
                        <svg class="w-4 h-4 text-emerald-200 ml-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        <span>تأكيد واستلام الربح الآن</span>
                    `;
                }
            } else {
                remaining--;
            }
        };

        updateClock();
        antiCheatInterval = setInterval(updateClock, 1000);
    };

    /**
     * Submit Reward Claim - Real-time Balance & 24h Cooldown Sync
     */
    const handleClaimReward = async () => {
        const claimBtn = document.getElementById('task-claim-btn');
        if (claimBtn) {
            claimBtn.disabled = true;
            claimBtn.innerHTML = `جاري تحويل الربح لمحفظتك...`;
        }

        try {
            const token = activeTaskSession ? activeTaskSession.token : '';
            const res = await API.post('tasks/claim', { token: token });
            App.toast(res.message || 'تهانينا! تم التحقق من إنجاز المهمة وإضافة الربح لمحفظتك.', 'success');
            closeTaskModal();
            
            // Immediate real-time sync across dashboard
            try {
                const meRes = await API.get('auth/me');
                if (meRes && meRes.data) {
                    App.syncUserProfileUi(meRes.data);
                }
            } catch (syncErr) {
                console.warn('Profile real-time balance sync exception:', syncErr);
            }

            await load();
            App.navigate('home');
        } catch (err) {
            App.toast(err.message || 'فشلت معالجة استلام مكافأة المهمة.', 'error');
            if (claimBtn) {
                claimBtn.disabled = false;
                claimBtn.innerHTML = `<span>إعادة محاولة استلام الربح</span>`;
            }
        }
    };

    /**
     * Close Task Execution Modal
     */
    const closeTaskModal = () => {
        const modal = document.getElementById('task-execution-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        if (antiCheatInterval) clearInterval(antiCheatInterval);
        activeTaskSession = null;
    };

    return {
        load,
        openTaskModal,
        closeTaskModal,
        handleClaimReward
    };
})();

// Explicitly expose on window for reliable global invocation
window.Dashboard = Dashboard;
