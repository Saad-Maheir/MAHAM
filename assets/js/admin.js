/**
 * MAHAM FinTech Platform - Admin Command Center Management Script (Phase 2)
 * Executive Analytics, Deposit/Withdrawal Queues, Task & User Management
 */

const Admin = (() => {
    let currentAdmin = null;
    let selectedDeposit = null;
    let selectedWithdrawal = null;

    /**
     * Admin Initialization
     */
    const init = async () => {
        await API.initCsrf();
        await checkAdminAuth();
        loadAnalytics();
    };

    /**
     * Authenticate Administrator
     */
    const checkAdminAuth = async () => {
        try {
            const res = await API.get('auth/me');
            if (!res.data || res.data.user.role !== 'admin') {
                showAuthRequired('يرجى تسجيل الدخول بحساب مسؤول النظام للمتابعة.');
                return;
            }
            currentAdmin = res.data.user;
            const overlay = document.getElementById('admin-auth-guard');
            if (overlay) {
                overlay.classList.add('hidden');
                overlay.classList.remove('flex');
            }
            const nameEl = document.getElementById('admin-display-name');
            if (nameEl) nameEl.textContent = currentAdmin.full_name;
        } catch (e) {
            showAuthRequired('يرجى تسجيل الدخول بحساب مسؤول للوصول للوحة التحكم.');
        }
    };

    const showAuthRequired = (msg) => {
        const overlay = document.getElementById('admin-auth-guard');
        const text = document.getElementById('admin-guard-message');
        if (overlay) {
            if (text && msg) {
                text.textContent = msg;
                text.classList.remove('hidden');
            }
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        }
    };

    /**
     * Handle Direct Admin Login Form
     */
    const handleAdminLogin = async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('admin-login-error');
        const submitBtn = document.getElementById('admin-login-submit-btn');
        const identifier = document.getElementById('admin-login-identifier')?.value.trim();
        const password = document.getElementById('admin-login-password')?.value;

        if (errEl) errEl.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>جاري التحقق والمصادقة...</span>`;
        }

        try {
            const res = await API.post('auth/login', {
                identifier: identifier,
                password: password
            });

            if (res.data.user && res.data.user.role === 'admin') {
                currentAdmin = res.data.user;
                const overlay = document.getElementById('admin-auth-guard');
                if (overlay) {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex');
                }
                const nameEl = document.getElementById('admin-display-name');
                if (nameEl) nameEl.textContent = currentAdmin.full_name;
                App.toast('أهلاً بك في مركز القيادة والعمليات المركزية.', 'success');
                loadAnalytics();
            } else {
                throw new Error('عذراً، هذا الحساب لا يمتلك صلاحيات إدارة النظام.');
            }
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message || 'بيانات الدخول الإدارية غير صحيحة.';
                errEl.classList.remove('hidden');
            }
            App.toast(err.message || 'فشل تسجيل الدخول الإداري.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>تسجيل الدخول إلى مركز القيادة</span>`;
            }
        }
    };

    /**
     * Section Navigator
     */
    const switchSection = (sectionId) => {
        const sections = ['overview', 'deposits', 'withdrawals', 'tasks', 'users', 'settings'];
        sections.forEach(s => {
            const el = document.getElementById(`admin-sec-${s}`);
            const btn = document.getElementById(`admin-nav-${s}`);
            if (el) {
                if (s === sectionId) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            }
            if (btn) {
                if (s === sectionId) {
                    btn.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
                    btn.classList.remove('text-slate-400', 'border-transparent');
                } else {
                    btn.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
                    btn.classList.add('text-slate-400', 'border-transparent');
                }
            }
        });

        // Trigger loaders
        switch (sectionId) {
            case 'overview': loadAnalytics(); break;
            case 'deposits': loadDeposits(); break;
            case 'withdrawals': loadWithdrawals(); break;
            case 'tasks': loadTasks(); break;
            case 'users': loadUsers(); break;
            case 'settings': loadSettings(); break;
        }
    };

    /**
     * 1. Overview & Analytics Loader
     */
    const loadAnalytics = async () => {
        try {
            const res = await API.get('admin/stats');
            const data = res.data;

            // Update Bento Cards
            document.getElementById('stat-total-users').textContent = data.users.total.toLocaleString('ar-IQ');
            document.getElementById('stat-active-users').textContent = `${data.users.active} نشط`;
            document.getElementById('stat-system-balance').textContent = `${Number(data.users.total_system_balance).toLocaleString('ar-IQ')} د.ع`;
            document.getElementById('stat-today-tasks').textContent = data.tasks.completed_today.toLocaleString('ar-IQ');
            document.getElementById('stat-today-rewards').textContent = `${Number(data.tasks.rewards_paid_today).toLocaleString('ar-IQ')} د.ع`;
            document.getElementById('stat-total-deposits').textContent = `${Number(data.financials.total_deposits).toLocaleString('ar-IQ')} د.ع`;
            document.getElementById('stat-total-withdrawals').textContent = `${Number(data.financials.total_withdrawals).toLocaleString('ar-IQ')} د.ع`;
            document.getElementById('stat-pending-deposits-badge').textContent = data.financials.pending_deposits;
            document.getElementById('stat-pending-withdrawals-badge').textContent = data.financials.pending_withdrawals;
            document.getElementById('stat-vip-subs').textContent = data.vip.active_subscriptions.toLocaleString('ar-IQ');
        } catch (e) {
            App.toast('تعذر جلب إحصائيات النظام.', 'error');
        }
    };

    /**
     * 2. Deposits Approval Queue
     */
    const loadDeposits = async (status = 'pending') => {
        try {
            const res = await API.get(`admin/deposits?status=${status}`);
            const deposits = res.data.deposits || [];
            const tbody = document.getElementById('deposits-queue-tbody');

            if (deposits.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-slate-500">لا توجد طلبات إيداع في هذا الطابور حالياً.</td></tr>`;
                return;
            }

            tbody.innerHTML = deposits.map(dep => `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition">
                    <td class="py-3 px-4 font-bold text-white">
                        <div>${dep.user_name}</div>
                        <div class="text-[11px] text-slate-400 font-mono">${dep.user_phone}</div>
                    </td>
                    <td class="py-3 px-4 text-emerald-400 font-mono font-bold text-sm">
                        ${Number(dep.amount).toLocaleString('ar-IQ')} د.ع
                    </td>
                    <td class="py-3 px-4 text-xs text-slate-300">
                        <span class="px-2 py-0.5 rounded bg-slate-800 font-mono">${dep.payment_method}</span>
                        <div class="text-[11px] text-slate-400 mt-1 font-mono">مرجع: ${dep.tx_reference}</div>
                    </td>
                    <td class="py-3 px-4 text-center">
                        ${dep.receipt_image ? `
                            <button onclick="Admin.inspectReceipt('${dep.receipt_image}', '${dep.tx_reference}', ${dep.amount}, ${dep.id})" class="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition">
                                عرض الإشعار
                            </button>
                        ` : '<span class="text-slate-500 text-xs">—</span>'}
                    </td>
                    <td class="py-3 px-4 text-slate-400 font-mono text-xs">
                        ${dep.created_at.substring(0, 16)}
                    </td>
                    <td class="py-3 px-4 text-left">
                        ${dep.status === 'pending' ? `
                            <div class="flex items-center gap-1.5 justify-end">
                                <button onclick="Admin.approveDeposit(${dep.id}, ${dep.amount})" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition">
                                    قبول
                                </button>
                                <button onclick="Admin.rejectDepositPrompt(${dep.id})" class="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition">
                                    رفض
                                </button>
                            </div>
                        ` : `
                            <span class="px-2.5 py-1 rounded-full text-xs font-bold ${dep.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
                                ${dep.status === 'approved' ? 'معتمد' : 'مرفوض'}
                            </span>
                        `}
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            App.toast('تعذر جلب طابور الإيداعات.', 'error');
        }
    };

    const inspectReceipt = (imgPath, ref, amount, txId) => {
        const modal = document.getElementById('receipt-inspect-modal');
        const img = document.getElementById('inspect-receipt-img');
        const refEl = document.getElementById('inspect-receipt-ref');
        const amtEl = document.getElementById('inspect-receipt-amount');
        const approveBtn = document.getElementById('inspect-approve-btn');

        img.src = imgPath;
        refEl.textContent = ref;
        amtEl.textContent = `${Number(amount).toLocaleString('ar-IQ')} د.ع`;

        approveBtn.onclick = () => {
            closeReceiptInspect();
            approveDeposit(txId, amount);
        };

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    };

    const closeReceiptInspect = () => {
        const modal = document.getElementById('receipt-inspect-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    };

    const approveDeposit = async (txId, amount) => {
        if (!confirm(`هل أنت متأكد من الموافقة على طلب الإيداع بمبلغ ${Number(amount).toLocaleString('ar-IQ')} د.ع وإضافته لرصيد المستخدم؟`)) return;

        try {
            const res = await API.post('admin/deposits/approve', { transaction_id: txId });
            App.toast(res.message, 'success');
            loadDeposits();
            loadAnalytics();
        } catch (e) {
            App.toast(e.message, 'error');
        }
    };

    const rejectDepositPrompt = async (txId) => {
        const reason = prompt('يرجى كتابة سبب رفض طلب الإيداع (ليظهر في السجل المالي للمستخدم):', 'إشعار التحويل غير مطابق أو رقم الحوالة غير صحيح');
        if (!reason) return;

        try {
            const res = await API.post('admin/deposits/reject', { transaction_id: txId, reason: reason });
            App.toast(res.message, 'info');
            loadDeposits();
            loadAnalytics();
        } catch (e) {
            App.toast(e.message, 'error');
        }
    };

    /**
     * 3. Withdrawals Approval Queue
     */
    const loadWithdrawals = async (status = 'pending') => {
        try {
            const res = await API.get(`admin/withdrawals?status=${status}`);
            const withdrawals = res.data.withdrawals || [];
            const tbody = document.getElementById('withdrawals-queue-tbody');

            if (withdrawals.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-slate-500">لا توجد طلبات سحب في هذا الطابور حالياً.</td></tr>`;
                return;
            }

            tbody.innerHTML = withdrawals.map(w => `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition">
                    <td class="py-3 px-4 font-bold text-white">
                        <div>${w.user_name}</div>
                        <div class="text-[11px] text-slate-400 font-mono">${w.user_email}</div>
                    </td>
                    <td class="py-3 px-4 text-amber-400 font-mono font-bold text-sm">
                        ${Number(w.amount).toLocaleString('ar-IQ')} د.ع
                    </td>
                    <td class="py-3 px-4 text-xs text-slate-300">
                        <span class="px-2 py-0.5 rounded bg-slate-800 font-mono">${w.payment_method}</span>
                        <div class="text-[12px] text-slate-200 font-mono font-bold mt-1 tracking-wider">${w.receiver_account}</div>
                    </td>
                    <td class="py-3 px-4 text-slate-400 font-mono text-xs">
                        ${w.created_at.substring(0, 16)}
                    </td>
                    <td class="py-3 px-4 text-left">
                        ${w.status === 'pending' ? `
                            <div class="flex items-center gap-1.5 justify-end">
                                <button onclick="Admin.approveWithdrawal(${w.id}, ${w.amount})" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition">
                                    تأكيد الصرف
                                </button>
                                <button onclick="Admin.rejectWithdrawalPrompt(${w.id}, ${w.amount})" class="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition">
                                    رفض وإرجاع
                                </button>
                            </div>
                        ` : `
                            <span class="px-2.5 py-1 rounded-full text-xs font-bold ${w.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
                                ${w.status === 'approved' ? 'تم الصرف' : 'مرفوض'}
                            </span>
                        `}
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            App.toast('تعذر جلب طابور السحوبات.', 'error');
        }
    };

    const approveWithdrawal = async (txId, amount) => {
        if (!confirm(`هل قمت بتحويل الحوالة المالية فعلياً لحساب العميل بمبلغ ${Number(amount).toLocaleString('ar-IQ')} د.ع وتود تأكيد الصرف؟`)) return;

        try {
            const res = await API.post('admin/withdrawals/approve', { transaction_id: txId });
            App.toast(res.message, 'success');
            loadWithdrawals();
            loadAnalytics();
        } catch (e) {
            App.toast(e.message, 'error');
        }
    };

    const rejectWithdrawalPrompt = async (txId, amount) => {
        const reason = prompt(`يرجى كتابة سبب رفض السحب (سيتم إرجاع ${Number(amount).toLocaleString('ar-IQ')} د.ع فورياً إلى رصيد المستخدم المتاح):`, 'رقم المحفظة غير مسجل لدى المشغل');
        if (!reason) return;

        try {
            const res = await API.post('admin/withdrawals/reject', { transaction_id: txId, reason: reason });
            App.toast(res.message, 'info');
            loadWithdrawals();
            loadAnalytics();
        } catch (e) {
            App.toast(e.message, 'error');
        }
    };

    /**
     * 4. Micro-Task Manager
     */
    const loadTasks = async () => {
        try {
            const res = await API.get('admin/tasks');
            const tasks = res.data.tasks || [];
            const tbody = document.getElementById('tasks-manager-tbody');

            tbody.innerHTML = tasks.map(t => `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition">
                    <td class="py-3 px-4 font-bold text-white">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${t.is_active ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
                            <span>${t.title}</span>
                        </div>
                        <div class="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">${t.description}</div>
                        <div class="flex items-center gap-2 mt-1.5">
                            ${t.target_type === 'specific' 
                                ? `<span class="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">خاص: ${t.target_user_name || 'مستخدم #' + t.target_user_id}</span>`
                                : `<span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">عام (الكل)</span>`
                            }
                            ${t.attachment_url ? `<a href="${t.attachment_url}" target="_blank" class="text-[10px] text-sky-400 hover:text-sky-300 underline flex items-center gap-0.5"><span>عرض المرفق</span></a>` : ''}
                        </div>
                    </td>
                    <td class="py-3 px-4 text-emerald-400 font-mono font-bold text-xs">
                        ${Number(t.reward_amount).toLocaleString('ar-IQ')} د.ع
                    </td>
                    <td class="py-3 px-4 text-slate-300 font-mono text-xs">
                        ${t.required_seconds} ثانية
                    </td>
                    <td class="py-3 px-4 text-slate-300 font-mono text-xs">
                        ${Number(t.completions_count).toLocaleString('ar-IQ')} مرة
                    </td>
                    <td class="py-3 px-4 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${t.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}">
                            ${t.is_active ? 'نشطة' : 'معطلة'}
                        </span>
                    </td>
                    <td class="py-3 px-4 text-left">
                        <button onclick="Admin.toggleTaskStatus(${t.id})" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition">
                            ${t.is_active ? 'تعطيل' : 'تفعيل'}
                        </button>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            App.toast('تعذر جلب قائمة المهام.', 'error');
        }
    };

    const toggleTargetUserField = async () => {
        const typeSelect = document.getElementById('task-new-target-type');
        const container = document.getElementById('task-new-target-user-container');
        if (!typeSelect || !container) return;

        if (typeSelect.value === 'specific') {
            container.classList.remove('hidden');
            await populateTargetUsersDropdown();
        } else {
            container.classList.add('hidden');
        }
    };

    const populateTargetUsersDropdown = async () => {
        const select = document.getElementById('task-new-target-user');
        if (!select) return;

        try {
            const res = await API.get('admin/users');
            const users = res.data.users || [];
            select.innerHTML = `<option value="">اختر المستخدم من القائمة...</option>` +
                users.map(u => `<option value="${u.id}">${u.full_name} (${u.email} - ${u.phone || 'Google'})</option>`).join('');
        } catch (e) {
            select.innerHTML = `<option value="">تعذر جلب المستخدمين</option>`;
        }
    };

    const assignTaskToUser = async (userId, userName) => {
        switchSection('tasks');
        const typeSelect = document.getElementById('task-new-target-type');
        if (typeSelect) {
            typeSelect.value = 'specific';
            await toggleTargetUserField();
            const userSelect = document.getElementById('task-new-target-user');
            if (userSelect) userSelect.value = userId;
        }
        const titleInput = document.getElementById('task-new-title');
        if (titleInput) {
            titleInput.focus();
            titleInput.scrollIntoView({ behavior: 'smooth' });
        }
        App.toast(`تم تحديد المستخدم "${userName}" لإسناد مهمة خاصة له.`, 'info');
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        const title = document.getElementById('task-new-title').value.trim();
        const desc = document.getElementById('task-new-desc').value.trim();
        const cat = document.getElementById('task-new-cat').value;
        const url = document.getElementById('task-new-url').value.trim();
        const attachment = document.getElementById('task-new-attachment')?.value.trim() || '';
        const targetType = document.getElementById('task-new-target-type')?.value || 'all';
        const targetUserId = document.getElementById('task-new-target-user')?.value || '';
        const reward = document.getElementById('task-new-reward').value;
        const seconds = document.getElementById('task-new-seconds').value;

        if (targetType === 'specific' && !targetUserId) {
            App.toast('يرجى اختيار المستخدم المستهدف للمهمة الموجهة.', 'error');
            return;
        }

        try {
            const res = await API.post('admin/tasks/create', {
                title: title,
                description: desc,
                category: cat,
                target_url: url,
                attachment_url: attachment,
                target_type: targetType,
                target_user_id: targetUserId,
                reward_amount: reward,
                required_seconds: seconds
            });

            App.toast(res.message, 'success');
            document.getElementById('create-task-form').reset();
            const container = document.getElementById('task-new-target-user-container');
            if (container) container.classList.add('hidden');
            loadTasks();
        } catch (err) {
            App.toast(err.message, 'error');
        }
    };

    const toggleTaskStatus = async (taskId) => {
        try {
            const res = await API.post('admin/tasks/update', {
                task_id: taskId,
                toggle_status: 1
            });
            App.toast(res.message, 'success');
            loadTasks();
        } catch (e) {
            App.toast(e.message, 'error');
        }
    };

    /**
     * 5. User Directory & Balance Adjustment
     */
    const loadUsers = async () => {
        const searchInput = document.getElementById('users-search-input');
        const query = searchInput ? searchInput.value.trim() : '';

        try {
            const res = await API.get(`admin/users?search=${encodeURIComponent(query)}`);
            const users = res.data.users || [];
            const tbody = document.getElementById('users-table-tbody');

            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-slate-500">لا يوجد مستخدمين مطابقين للبحث.</td></tr>`;
                return;
            }

            tbody.innerHTML = users.map(u => `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition">
                    <td class="py-3 px-4 font-bold text-white">
                        <div>${u.full_name}</div>
                        <div class="text-[11px] text-slate-400 font-mono">${u.email}</div>
                    </td>
                    <td class="py-3 px-4 font-mono text-xs text-slate-300">
                        ${u.phone}
                    </td>
                    <td class="py-3 px-4 text-emerald-400 font-mono font-bold text-xs">
                        ${Number(u.balance).toLocaleString('ar-IQ')} د.ع
                    </td>
                    <td class="py-3 px-4 text-xs font-bold text-amber-400">
                        ${u.active_vip_name || 'الباقة المجانية'}
                    </td>
                    <td class="py-3 px-4 text-center">
                        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${u.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
                            ${u.status === 'active' ? 'نشط' : 'معلق'}
                        </span>
                    </td>
                    <td class="py-3 px-4 text-left">
                        <div class="flex items-center gap-1.5 justify-end">
                            <button onclick="Admin.assignTaskToUser(${u.id}, '${u.full_name}')" class="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold transition" title="إسناد مهمة موجهة">
                                إسناد مهمة
                            </button>
                            <button onclick="Admin.openBalanceModal(${u.id}, '${u.full_name}', ${u.balance})" class="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-semibold transition">
                                تعديل الرصيد
                            </button>
                            <button onclick="Admin.toggleUserStatus(${u.id}, '${u.status === 'active' ? 'suspended' : 'active'}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition">
                                ${u.status === 'active' ? 'تجميد' : 'تفعيل'}
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            App.toast('تعذر جلب سجل المستخدمين.', 'error');
        }
    };

    const toggleUserStatus = async (userId, newStatus) => {
        try {
            const res = await API.post('admin/users/toggle-status', {
                user_id: userId,
                status: newStatus
            });
            App.toast(res.message, 'success');
            loadUsers();
        } catch (e) {
            App.toast(e.message, 'error');
        }
    };

    const openBalanceModal = (userId, name, currentBalance) => {
        const modal = document.getElementById('user-balance-modal');
        document.getElementById('balance-modal-user-id').value = userId;
        document.getElementById('balance-modal-user-name').textContent = name;
        document.getElementById('balance-modal-current').textContent = `${Number(currentBalance).toLocaleString('ar-IQ')} د.ع`;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    };

    const closeBalanceModal = () => {
        const modal = document.getElementById('user-balance-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    };

    const handleBalanceSubmit = async (e) => {
        e.preventDefault();
        const userId = document.getElementById('balance-modal-user-id').value;
        const type = document.getElementById('balance-modal-type').value;
        const amount = document.getElementById('balance-modal-amount').value;
        const notes = document.getElementById('balance-modal-notes').value.trim();

        try {
            const res = await API.post('admin/users/adjust-balance', {
                user_id: userId,
                adjustment_type: type,
                amount: amount,
                notes: notes
            });
            App.toast(res.message, 'success');
            closeBalanceModal();
            loadUsers();
            loadAnalytics();
        } catch (err) {
            App.toast(err.message, 'error');
        }
    };

    /**
     * 6. Official Payment Gateway Accounts Settings
     */
    const loadSettings = async () => {
        try {
            const res = await API.get('admin/settings');
            const s = res.data.settings || {};

            if (s.zain_cash_number) document.getElementById('set-zain').value = s.zain_cash_number;
            if (s.asia_hawala_number) document.getElementById('set-asia').value = s.asia_hawala_number;
            if (s.qi_card_number) document.getElementById('set-qi').value = s.qi_card_number;
            if (s.official_account_name) document.getElementById('set-name').value = s.official_account_name;
            if (s.min_deposit_iqd) document.getElementById('set-min-dep').value = s.min_deposit_iqd;
            if (s.min_withdraw_iqd) document.getElementById('set-min-with').value = s.min_withdraw_iqd;
        } catch (e) {
            App.toast('تعذر جلب إعدادات المنصة.', 'error');
        }
    };

    const handleSettingsSubmit = async (e) => {
        e.preventDefault();
        const payload = {
            zain_cash_number: document.getElementById('set-zain').value.trim(),
            asia_hawala_number: document.getElementById('set-asia').value.trim(),
            qi_card_number: document.getElementById('set-qi').value.trim(),
            official_account_name: document.getElementById('set-name').value.trim(),
            min_deposit_iqd: document.getElementById('set-min-dep').value,
            min_withdraw_iqd: document.getElementById('set-min-with').value
        };

        try {
            const res = await API.post('admin/settings/update', payload);
            App.toast(res.message, 'success');
        } catch (err) {
            App.toast(err.message, 'error');
        }
    };

    const handleLogout = async () => {
        try {
            await API.post('auth/logout');
        } catch (e) {}
        currentAdmin = null;
        showAuthRequired('تم تسجيل الخروج من لوحة الإدارة.');
    };

    return {
        init,
        handleAdminLogin,
        handleLogout,
        switchSection,
        toggleTargetUserField,
        assignTaskToUser,
        loadDeposits,
        inspectReceipt,
        closeReceiptInspect,
        approveDeposit,
        rejectDepositPrompt,
        loadWithdrawals,
        approveWithdrawal,
        rejectWithdrawalPrompt,
        handleCreateTask,
        toggleTaskStatus,
        loadUsers,
        toggleUserStatus,
        openBalanceModal,
        closeBalanceModal,
        handleBalanceSubmit,
        handleSettingsSubmit
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    Admin.init();
});

