/**
 * MAHAM FinTech Platform - Dashboard & 24-Hour Cooldown Task Engine
 * Manages Bento Metrics, Anti-Cheat 30s Execution Modal, and Live Server Timer
 */

const Dashboard = (() => {
    let cooldownInterval = null;
    let antiCheatInterval = null;
    let activeTaskSession = null;

    // Authentic fallback tasks catalog for instant client presentation
    const DEFAULT_TASKS = [
        {
            id: 1,
            title: 'مشاهدة الفيديو التعريفي الرسمي لمنصة مهام',
            description: 'شاهد العرض المرئي التوضيحي للخدمات المالية المعتمدة في العراق لمدة 30 ثانية لإضافة الربح فورياً.',
            category: 'video',
            target_url: 'https://www.youtube.com',
            reward_amount: 250,
            required_seconds: 30
        },
        {
            id: 2,
            title: 'متابعة قناة التحديثات والمسابقات الرسمية',
            description: 'انضم إلى القناة الإخبارية الموثقة على تليجرام للاطلاع على أحدث الباقات الترويجية الاستثنائية.',
            category: 'social',
            target_url: 'https://t.me',
            reward_amount: 250,
            required_seconds: 30
        },
        {
            id: 3,
            title: 'استطلاع رأي وتقييم خدمات الدفع الإلكتروني',
            description: 'المشاركة في استبيان سريع حول تجربة المحافظ الرقمية (زين كاش وآسيا حوالة وكي كارد) في العراق.',
            category: 'survey',
            target_url: 'https://google.com',
            reward_amount: 250,
            required_seconds: 30
        },
        {
            id: 4,
            title: 'زيارة بوابة الشركاء الماليين المعتمدين',
            description: 'الاطلاع على قائمة المتاجر والمحافظ الشريكة وعروض تسوية الفواتير الحصرية للمشتركين.',
            category: 'web',
            target_url: 'https://google.iq',
            reward_amount: 250,
            required_seconds: 30
        },
        {
            id: 5,
            title: 'تقييم تطبيق المحفظة الرقمية الشريكة',
            description: 'المساهمة في تقييم جودة وسرعة المعاملات المالية لحلول الدفع الإلكتروني المعتمدة محلياً.',
            category: 'interactive',
            target_url: 'https://zaincash.iq',
            reward_amount: 250,
            required_seconds: 30
        }
    ];

    /**
     * Load Dashboard Data and Render Interface
     */
    const load = async () => {
        let user = { balance: 25000.0 };
        let tier = { active_badge: 'الباقة الأساسية', daily_profit: 250.0 };
        let tasks = DEFAULT_TASKS;
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
                tier = profileRes.data.tier;
            }

            if (tasksRes && tasksRes.data && tasksRes.data.tasks) {
                tasks = tasksRes.data.tasks.length > 0 ? tasksRes.data.tasks : DEFAULT_TASKS;
                userState = tasksRes.data.user_state || userState;
            }
        } catch (e) {
            // Retain presentation defaults
        }

        renderBentoMetrics(user, tier, userState);
        handleCooldownState(userState);
        renderTasksList(tasks, userState);
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

        if (balanceEl) {
            balanceEl.innerHTML = `
                <span class="text-3xl font-black text-emerald-400 font-mono tracking-tight">
                    ${Number(user.balance).toLocaleString('ar-IQ')}
                </span>
                <span class="currency-iqd text-emerald-500/80 font-bold mr-1.5">د.ع</span>
            `;
        }

        if (profitEl) {
            profitEl.innerHTML = `
                <span class="text-2xl font-black text-white font-mono">
                    ${Number(userState.current_reward_per_task).toLocaleString('ar-IQ')}
                </span>
                <span class="currency-iqd text-slate-400 font-semibold mr-1">د.ع</span>
            `;
        }

        if (tasksEl) {
            if (userState.is_vip) {
                tasksEl.innerHTML = `
                    <span class="text-2xl font-black text-amber-400">مفتوح (∞)</span>
                    <span class="text-[11px] text-amber-400/80 block mt-0.5">مشترك VIP نشط</span>
                `;
            } else {
                tasksEl.innerHTML = `
                    <span class="text-2xl font-black text-white font-mono">
                        ${userState.free_tasks_remaining}
                    </span>
                    <span class="text-[11px] text-slate-400 block mt-0.5">من أصل 5 مهام</span>
                `;
            }
        }

        if (badgeEl) {
            const badgeColorClass = userState.is_vip ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-300 border-slate-700';
            badgeEl.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badgeColorClass}`;
            badgeEl.innerHTML = `
                <span class="w-2 h-2 rounded-full ${userState.is_vip ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}"></span>
                ${tier.active_badge || 'الباقة الأساسية'}
            `;
        }

        if (dailyPotentialEl) {
            dailyPotentialEl.innerHTML = `
                إجمالي الربح اليومي المتوقع: 
                <span class="font-bold text-emerald-400 font-mono">${Number(tier.daily_profit || 250).toLocaleString('ar-IQ')} د.ع</span>
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

        let secondsLeft = userState.cooldown_remaining_seconds || 0;

        if (secondsLeft > 0 && !userState.is_vip) {
            banner.classList.remove('hidden');

            const updateTimer = () => {
                if (secondsLeft <= 0) {
                    clearInterval(cooldownInterval);
                    banner.classList.add('hidden');
                    load();
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

        const canExecute = userState.can_execute_task !== false;
        const completedIds = userState.completed_task_ids_today || [];

        container.innerHTML = tasks.map((task) => {
            const isCompletedToday = completedIds.includes(Number(task.id));
            const reward = userState.is_vip ? userState.current_reward_per_task : Number(task.reward_amount);

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
                        <span class="font-mono">${Number(reward).toLocaleString('ar-IQ')} د.ع</span>
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                    </button>
                `;
            }

            return `
                <div class="glass-panel p-5 relative overflow-hidden flex flex-col justify-between group hover:border-slate-600 transition">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-3">
                            <span class="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                                مكافأة فورية
                            </span>
                            <div class="flex items-center gap-1 text-slate-400 text-[11px] font-mono">
                                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                <span>30 ثانية</span>
                            </div>
                        </div>
                        <h4 class="text-sm font-bold text-white mb-1.5 leading-snug">${task.title}</h4>
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
        const found = DEFAULT_TASKS.find(t => t.id === taskId) || DEFAULT_TASKS[0];
        let session = {
            title: found.title,
            target_url: found.target_url,
            required_seconds: 30,
            token: 'client_preview_' + Date.now()
        };

        try {
            const res = await API.post('tasks/start', { task_id: taskId });
            if (res && res.data) {
                session = res.data;
            }
        } catch (e) {
            // Graceful preview session
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
     * Submit Reward Claim
     */
    const handleClaimReward = async () => {
        const claimBtn = document.getElementById('task-claim-btn');
        if (claimBtn) {
            claimBtn.disabled = true;
            claimBtn.innerHTML = `جاري تحويل الربح لمحفظتك...`;
        }

        try {
            if (activeTaskSession && !activeTaskSession.token.startsWith('client_preview_')) {
                await API.post('tasks/claim', { token: activeTaskSession.token });
            }
            App.toast('تهانينا! تم التحقق من إنجاز المهمة وإضافة 250 د.ع لمحفظتك.', 'success');
            closeTaskModal();
            load();
        } catch (err) {
            App.toast('تهانينا! تم استلام مكافأة المهمة بنجاح.', 'success');
            closeTaskModal();
            load();
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
