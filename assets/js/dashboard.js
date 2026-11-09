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
        try {
            const [profileRes, tasksRes] = await Promise.all([
                API.get('auth/me'),
                API.get('tasks/list')
            ]);

            const user = profileRes.data.user;
            const tier = profileRes.data.tier;
            const tasks = tasksRes.data.tasks;
            const userState = tasksRes.data.user_state;

            // Render Bento Metric Cards
            renderBentoMetrics(user, tier, userState);

            // Handle 24-Hour Cooldown Timer
            handleCooldownState(userState);

            // Render Task Cards Grid
            renderTasksList(tasks, userState);
        } catch (err) {
            console.error('Failed to load dashboard:', err);
            App.toast('تعذر تحميل بيانات لوحة التحكم.', 'error');
        }
    };

    /**
     * Render Top Bento Cards
     */
    const renderBentoMetrics = (user, tier, userState) => {
        const balanceEl = document.getElementById('bento-total-balance');
        const profitEl  = document.getElementById('bento-task-profit');
        const tasksEl   = document.getElementById('bento-available-tasks');
        const badgeEl   = document.getElementById('bento-tier-badge');
        const dailyPotentialEl = document.getElementById('bento-daily-potential');

        // Formatted Balance
        if (balanceEl) {
            balanceEl.innerHTML = `
                <span class="text-3xl lg:text-4xl font-extrabold text-emerald-400 font-mono tracking-tight">
                    ${Number(user.balance).toLocaleString('ar-IQ')}
                </span>
                <span class="currency-iqd text-emerald-500/80 font-bold mr-1.5">د.ع</span>
            `;
        }

        // Current Task Profit
        if (profitEl) {
            profitEl.innerHTML = `
                <span class="text-2xl lg:text-3xl font-bold text-white font-mono">
                    ${Number(userState.current_reward_per_task).toLocaleString('ar-IQ')}
                </span>
                <span class="currency-iqd text-slate-400 font-semibold mr-1">د.ع</span>
            `;
        }

        // Available Tasks
        if (tasksEl) {
            if (userState.is_vip) {
                tasksEl.innerHTML = `
                    <span class="text-2xl lg:text-3xl font-black text-amber-400">مفتوح (∞)</span>
                    <span class="text-xs text-amber-400/80 block mt-0.5">مشترك VIP نشط</span>
                `;
            } else {
                tasksEl.innerHTML = `
                    <span class="text-2xl lg:text-3xl font-black text-white font-mono">
                        ${userState.free_tasks_remaining}
                    </span>
                    <span class="text-xs text-slate-400 block mt-0.5">من أصل 5 مهام مجانية</span>
                `;
            }
        }

        // Tier Badge & Daily Profit Potential
        if (badgeEl) {
            const badgeColorClass = userState.is_vip ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-700/40 text-slate-300 border-slate-600/40';
            badgeEl.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badgeColorClass}`;
            badgeEl.innerHTML = `
                <span class="w-2 h-2 rounded-full ${userState.is_vip ? 'bg-amber-400 animate-pulse' : 'bg-slate-400'}"></span>
                ${tier.active_badge}
            `;
        }

        if (dailyPotentialEl) {
            dailyPotentialEl.innerHTML = `
                إجمالي الربح اليومي المتوقع: 
                <span class="font-bold text-emerald-400 font-mono">${Number(tier.daily_profit).toLocaleString('ar-IQ')} د.ع</span>
            `;
        }
    };

    /**
     * Manage 24-Hour Server-Synced Cooldown Display
     */
    const handleCooldownState = (userState) => {
        if (cooldownInterval) clearInterval(cooldownInterval);

        const banner = document.getElementById('cooldown-banner');
        const timerText = document.getElementById('cooldown-timer-clock');

        if (!banner || !timerText) return;

        let secondsLeft = userState.cooldown_remaining_seconds;

        if (secondsLeft > 0 && !userState.is_vip) {
            banner.classList.remove('hidden');

            const updateTimer = () => {
                if (secondsLeft <= 0) {
                    clearInterval(cooldownInterval);
                    banner.classList.add('hidden');
                    load(); // Refresh state
                    return;
                }

                const h = Math.floor(secondsLeft / 3600).toString().padStart(2, '0');
                const m = Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0');
                const s = Math.floor(secondsLeft % 60).toString().padStart(2, '0');

                timerText.textContent = `${h}:${m}:${s}`;
                secondsLeft--;
            };

            updateTimer();
            cooldownInterval = setInterval(updateTimer, 1000);
        } else {
            banner.classList.add('hidden');
        }
    };

    /**
     * Render Interactive Task Cards
     */
    const renderTasksList = (tasks, userState) => {
        const container = document.getElementById('tasks-grid-container');
        if (!container) return;

        if (!tasks || tasks.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-slate-400">
                    لا توجد مهام نشطة متاحة في الوقت الحالي.
                </div>
            `;
            return;
        }

        const canExecute = userState.can_execute_task;
        const completedIds = userState.completed_task_ids_today || [];

        container.innerHTML = tasks.map((task) => {
            const isCompletedToday = completedIds.includes(Number(task.id));
            const reward = userState.is_vip ? userState.current_reward_per_task : Number(task.reward_amount);

            let actionButtonHtml = '';
            if (isCompletedToday) {
                actionButtonHtml = `
                    <button disabled class="w-full py-2.5 px-4 rounded-xl bg-slate-800 text-slate-500 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed">
                        <svg class="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                        تم إنجازها اليوم
                    </button>
                `;
            } else if (!canExecute) {
                const lockReason = userState.free_tasks_remaining === 0 
                    ? 'استنفذت المهام المجانية' 
                    : 'نظام التبريد نشط';
                actionButtonHtml = `
                    <button disabled class="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 text-slate-400 font-medium text-xs flex items-center justify-center gap-2 cursor-not-allowed border border-slate-700/50">
                        <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                        </svg>
                        مقفل (${lockReason})
                    </button>
                `;
            } else {
                actionButtonHtml = `
                    <button onclick="Dashboard.openTaskModal(${task.id})" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/40 hover:shadow-emerald-900/60 active:scale-98 transition flex items-center justify-center gap-2">
                        <span>تنفيذ المهمة وكسب</span>
                        <span class="font-mono">${Number(reward).toLocaleString('ar-IQ')} د.ع</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                    </button>
                `;
            }

            return `
                <div class="glass-panel p-5 relative overflow-hidden flex flex-col justify-between group">
                    <div class="absolute -top-12 -left-12 w-28 h-28 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition"></div>
                    <div>
                        <div class="flex items-start justify-between gap-3 mb-3">
                            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                                مكافأة فورية
                            </span>
                            <div class="flex items-center gap-1 text-slate-400 text-xs font-mono">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                <span>30 ثانية</span>
                            </div>
                        </div>
                        <h4 class="text-base font-bold text-white mb-2 leading-snug">${task.title}</h4>
                        <p class="text-xs text-slate-400 mb-4 line-clamp-2 leading-relaxed">${task.description}</p>
                    </div>
                    <div class="pt-3 border-t border-slate-800/80">
                        ${actionButtonHtml}
                    </div>
                </div>
            `;
        }).join('');
    };

    /**
     * Open Anti-Cheat Task Execution Modal
     */
    const openTaskModal = async (taskId) => {
        try {
            App.toast('جاري تهيئة جلسة التحقق الأمني للمهمة...', 'info');
            const res = await API.post('tasks/start', { task_id: taskId });
            const session = res.data;
            activeTaskSession = session;

            const modal = document.getElementById('task-execution-modal');
            const titleEl = document.getElementById('task-exec-title');
            const claimBtn = document.getElementById('task-claim-btn');
            const timerCircle = document.getElementById('task-timer-circle');
            const timerNumber = document.getElementById('task-timer-number');
            const targetLinkBtn = document.getElementById('task-target-link');

            titleEl.textContent = session.title;
            targetLinkBtn.href = session.target_url;

            // Automatically open task target URL in new tab
            window.open(session.target_url, '_blank');

            // Lock Claim Button
            claimBtn.disabled = true;
            claimBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-500', 'shadow-emerald-950/40');
            claimBtn.classList.add('bg-slate-800', 'text-slate-500', 'cursor-not-allowed');
            claimBtn.innerHTML = `
                <svg class="w-4 h-4 text-amber-400 animate-pulse ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                <span>جاري التحقق الأمني من إتمام المهمة...</span>
            `;

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            // Start 30s Countdown
            startAntiCheatTimer(session.required_seconds || 30);
        } catch (err) {
            App.toast(err.message, 'error');
        }
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

        const circumference = 2 * Math.PI * 45; // r=45
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
                // Unlock Claim Button
                claimBtn.disabled = false;
                claimBtn.classList.remove('bg-slate-800', 'text-slate-500', 'cursor-not-allowed');
                claimBtn.classList.add('bg-gradient-to-r', 'from-emerald-600', 'to-teal-600', 'hover:from-emerald-500', 'hover:to-teal-500', 'text-white', 'shadow-lg', 'shadow-emerald-950/40');
                claimBtn.innerHTML = `
                    <svg class="w-5 h-5 text-emerald-200 ml-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                    </svg>
                    <span>تأكيد واستلام الربح الآن</span>
                `;
            } else {
                remaining--;
            }
        };

        updateClock();
        antiCheatInterval = setInterval(updateClock, 1000);
    };

    /**
     * Submit Reward Claim
     */
    const handleClaimReward = async () => {
        if (!activeTaskSession || !activeTaskSession.token) {
            App.toast('رمز الجلسة غير صالح.', 'error');
            return;
        }

        const claimBtn = document.getElementById('task-claim-btn');
        claimBtn.disabled = true;
        claimBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            جاري تحويل الربح لمحفظتك...
        `;

        try {
            const res = await API.post('tasks/claim', {
                token: activeTaskSession.token
            });

            App.toast(res.message, 'success');
            closeTaskModal();
            load(); // Reload dashboard
        } catch (err) {
            App.toast(err.message, 'error');
            claimBtn.disabled = false;
        }
    };

    /**
     * Close Task Execution Modal
     */
    const closeTaskModal = () => {
        const modal = document.getElementById('task-execution-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
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

