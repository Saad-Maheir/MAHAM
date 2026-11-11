/**
 * MAHAM FinTech Platform - Admin Command Center Management Script (Phase 2)
 * Executive Analytics, Deposit/Withdrawal Queues, Task & User Management
 */

// Standalone Toast Notification System for Admin Command Center
const adminToast = (message, type = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

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

// Guarantee window.App and App.toast are available everywhere in admin
window.App = window.App || {};
window.App.toast = adminToast;

const Admin = (() => {
    let currentAdmin = null;
    let selectedDeposit = null;
    let selectedWithdrawal = null;

    /**
     * Admin Initialization
     */
    const init = async () => {
        initTheme();
        await API.initCsrf();
        const isAuthed = await checkAdminAuth();
        if (isAuthed) {
            loadAnalytics();
        }
    };

    /**
     * Theme Initialization & Toggle System for Admin Command Center
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
        if (typeof App !== 'undefined' && App.toast) {
            App.toast(`تم التبديل إلى ${newTheme === 'dark' ? 'الوضع الليلي' : 'الوضع النهاري'} بنجاح.`, 'info');
        }
    };

    const applyTheme = (theme) => {
        const html = document.documentElement;
        const icon = document.getElementById('header-theme-icon');
        const mobileIcon = document.getElementById('mobile-theme-icon');
        const label = document.getElementById('profile-theme-label');

        const sunSvg = `<svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`;
        const moonSvg = `<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>`;

        if (theme === 'dark') {
            html.classList.add('dark');
            if (icon) icon.innerHTML = sunSvg;
            if (mobileIcon) mobileIcon.innerHTML = sunSvg;
            if (label) label.textContent = 'الوضع الليلي';
        } else {
            html.classList.remove('dark');
            if (icon) icon.innerHTML = moonSvg;
            if (mobileIcon) mobileIcon.innerHTML = moonSvg;
            if (label) label.textContent = 'الوضع النهاري';
        }
    };

    /**
     * Toggle Admin Login Password Visibility
     */
    const toggleLoginPasswordVisibility = () => {
        const pwdInput = document.getElementById('admin-login-password');
        const eyeIcon = document.getElementById('admin-pwd-eye-icon');
        if (!pwdInput) return;
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            if (eyeIcon) {
                eyeIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/>`;
            }
        } else {
            pwdInput.type = 'password';
            if (eyeIcon) {
                eyeIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`;
            }
        }
    };

    /**
     * Authenticate Administrator
     */
    const checkAdminAuth = async () => {
        try {
            const res = await API.get('auth/me');
            if (res.data && res.data.user && res.data.user.role === 'admin') {
                currentAdmin = res.data.user;
                const overlay = document.getElementById('admin-auth-guard');
                if (overlay) {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex');
                    overlay.style.display = 'none';
                }
                const nameEl = document.getElementById('admin-display-name');
                if (nameEl) nameEl.textContent = currentAdmin.full_name;
                return true;
            } else {
                showAuthRequired('يرجى تسجيل الدخول بحساب مسؤول النظام للمتابعة.');
                return false;
            }
        } catch (e) {
            showAuthRequired('يرجى تسجيل الدخول بحساب مسؤول للوصول للوحة التحكم.');
            return false;
        }
    };

    const showAuthRequired = (msg) => {
        const overlay = document.getElementById('admin-auth-guard');
        const loginError = document.getElementById('admin-login-error');
        if (overlay) {
            if (loginError && msg) {
                loginError.textContent = msg;
                loginError.classList.remove('hidden');
            }
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
            overlay.style.display = 'flex';
        }
    };

    /**
     * Handle Direct Admin Login Form
     */
    const handleAdminLogin = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const errEl = document.getElementById('admin-login-error');
        const submitBtn = document.getElementById('admin-login-submit-btn');
        const identifier = (document.getElementById('admin-login-identifier')?.value || '').trim();
        const password = document.getElementById('admin-login-password')?.value || '';

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

            if (res.data && res.data.user && res.data.user.role === 'admin') {
                if (res.data && res.data.auth_token) {
                    API.setAuthToken(res.data.auth_token);
                }
                currentAdmin = res.data.user;
                const overlay = document.getElementById('admin-auth-guard');
                if (overlay) {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex');
                    overlay.style.display = 'none';
                }
                const nameEl = document.getElementById('admin-display-name');
                if (nameEl) nameEl.textContent = currentAdmin.full_name;
                toast('أهلاً بك في مركز القيادة والعمليات المركزية.', 'success');
                loadAnalytics();
            } else {
                throw new Error('عذراً، هذا الحساب لا يمتلك صلاحيات إدارة النظام.');
            }
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message || 'بيانات الدخول الإدارية غير صحيحة.';
                errEl.classList.remove('hidden');
            }
            toast(err.message || 'فشل تسجيل الدخول الإداري.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>تسجيل الدخول إلى مركز القيادة</span>`;
            }
        }
    };

    const toggleSidebar = (forceState) => {
        const sidebar = document.getElementById('admin-sidebar');
        const backdrop = document.getElementById('admin-sidebar-backdrop');
        if (!sidebar) return;

        const isClosed = sidebar.classList.contains('translate-x-full');
        const shouldOpen = typeof forceState === 'boolean' ? forceState : isClosed;

        if (shouldOpen) {
            sidebar.classList.remove('translate-x-full');
            sidebar.classList.add('translate-x-0');
            if (backdrop) backdrop.classList.remove('hidden');
        } else {
            sidebar.classList.add('translate-x-full');
            sidebar.classList.remove('translate-x-0');
            if (backdrop) backdrop.classList.add('hidden');
        }
    };

    /**
     * Section Navigator
     */
    const switchSection = (sectionId) => {
        if (window.innerWidth < 768) {
            toggleSidebar(false);
        }
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
            const mobBtn = document.getElementById(`admin-mob-nav-${s}`);
            if (mobBtn) {
                if (s === sectionId) {
                    mobBtn.classList.add('active', 'text-emerald-400');
                    mobBtn.classList.remove('text-slate-400');
                } else {
                    mobBtn.classList.remove('active', 'text-emerald-400');
                    mobBtn.classList.add('text-slate-400');
                }
            }
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });

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
            document.getElementById('stat-total-users').textContent = data.users.total.toLocaleString('en-US');
            document.getElementById('stat-active-users').textContent = `${data.users.active} نشط`;
            document.getElementById('stat-system-balance').textContent = `${Number(data.users.total_system_balance).toLocaleString('en-US')} د.ع`;
            document.getElementById('stat-today-tasks').textContent = data.tasks.completed_today.toLocaleString('en-US');
            document.getElementById('stat-today-rewards').textContent = `${Number(data.tasks.rewards_paid_today).toLocaleString('en-US')} د.ع مكافآت`;
            document.getElementById('stat-total-deposits').textContent = `${Number(data.financials.total_deposits).toLocaleString('en-US')} د.ع`;
            document.getElementById('stat-total-withdrawals').textContent = `${Number(data.financials.total_withdrawals).toLocaleString('en-US')} د.ع`;
            
            // Sync Pending Badges (Desktop & Mobile) - strictly hide if 0 or empty
            const depBadge = document.getElementById('stat-pending-deposits-badge');
            const mobDepBadge = document.getElementById('mob-stat-pending-deposits-badge');
            const withBadge = document.getElementById('stat-pending-withdrawals-badge');
            const mobWithBadge = document.getElementById('mob-stat-pending-withdrawals-badge');
            const pendingDeps = Number(data.financials.pending_deposits || 0);
            const pendingWiths = Number(data.financials.pending_withdrawals || 0);

            if (depBadge) {
                depBadge.textContent = pendingDeps;
                depBadge.classList.toggle('hidden', pendingDeps <= 0);
            }
            if (mobDepBadge) {
                mobDepBadge.textContent = pendingDeps;
                mobDepBadge.classList.toggle('hidden', pendingDeps <= 0);
            }
            if (withBadge) {
                withBadge.textContent = pendingWiths;
                withBadge.classList.toggle('hidden', pendingWiths <= 0);
            }
            if (mobWithBadge) {
                mobWithBadge.textContent = pendingWiths;
                mobWithBadge.classList.toggle('hidden', pendingWiths <= 0);
            }

            document.getElementById('stat-vip-subs').textContent = data.vip.active_subscriptions.toLocaleString('en-US');
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

            tbody.innerHTML = deposits.map(dep => {
                const userName = dep.user_name || dep.full_name || 'سعد ماهر سعد';
                const userPhone = dep.user_phone || dep.phone || dep.user_email || '—';
                const isAsiacell = dep.payment_method === 'asiacell';
                const methodBadge = isAsiacell ? `
                    <span class="px-2.5 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold text-xs inline-block">
                        كارت آسيا سيل
                    </span>
                    <div class="mt-1.5 p-1.5 rounded-lg bg-slate-900 border border-purple-500/30 flex items-center justify-between gap-1.5">
                        <span class="font-mono font-black text-amber-300 text-xs tracking-widest">${dep.tx_reference}</span>
                        <button type="button" onclick="navigator.clipboard.writeText('${dep.tx_reference}'); App.toast('تم نسخ رقم كارت آسيا سيل', 'success')" class="px-2 py-0.5 rounded bg-purple-600/30 text-purple-200 text-[10px] font-bold shrink-0">
                            نسخ الكارت
                        </button>
                    </div>
                ` : `
                    <span class="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs inline-block">
                        ماستر كارد (MasterCard)
                    </span>
                    <div class="text-[11px] text-slate-400 mt-1 font-mono">مرجع: ${dep.tx_reference}</div>
                `;

                const receiptCell = (isAsiacell || !dep.receipt_image) ? `
                    <span class="px-2 py-1 rounded bg-slate-800 text-[11px] text-slate-400">شحن رقمي مباشر</span>
                ` : `
                    <button onclick="Admin.inspectReceipt('${dep.receipt_image}', '${dep.tx_reference}', ${dep.amount}, ${dep.id})" class="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition">
                        معاينة الإشعار
                    </button>
                `;

                return `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition">
                    <td class="py-3 px-4 font-bold text-white">
                        <div>${userName}</div>
                        <div class="text-[11px] text-slate-400 font-mono">${userPhone}</div>
                    </td>
                    <td class="py-3 px-4 text-emerald-400 font-mono font-bold text-sm">
                        ${Number(dep.amount).toLocaleString('en-US')} د.ع
                    </td>
                    <td class="py-3 px-4 text-xs text-slate-300">
                        ${methodBadge}
                    </td>
                    <td class="py-3 px-4 text-center">
                        ${receiptCell}
                    </td>
                    <td class="py-3 px-4 text-slate-400 font-mono text-xs">
                        ${dep.created_at ? String(dep.created_at).substring(0, 16).replace('T', ' ') : 'الآن'}
                    </td>
                    <td class="py-3 px-4 text-left">
                        ${dep.status === 'pending' ? `
                            <div class="flex items-center gap-1.5 justify-end">
                                <button onclick="Admin.approveDeposit(${dep.id}, ${dep.amount})" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition">
                                    تأكيد وإضافة الرصيد
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
                `;
            }).join('');
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
        amtEl.textContent = `${Number(amount).toLocaleString('en-US')} د.ع`;

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
        if (!confirm(`هل أنت متأكد من الموافقة على طلب الإيداع بمبلغ ${Number(amount).toLocaleString('en-US')} د.ع وإضافته لرصيد المستخدم؟`)) return;

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

            tbody.innerHTML = withdrawals.map(w => {
                const userName = w.user_name || w.full_name || 'سعد ماهر سعد';
                const userPhone = w.user_phone || w.phone || w.user_email || '—';
                const cardNum = w.receiver_account || w.sender_account || w.tx_reference || '—';

                return `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition">
                    <td class="py-3 px-4 font-bold text-white">
                        <div>${userName}</div>
                        <div class="text-[11px] text-slate-400 font-mono">${userPhone}</div>
                    </td>
                    <td class="py-3 px-4 text-amber-400 font-mono font-bold text-sm">
                        ${Number(w.amount).toLocaleString('en-US')} د.ع
                    </td>
                    <td class="py-3 px-4 text-xs text-slate-300">
                        <span class="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs inline-block">
                            ماستر كارد (MasterCard)
                        </span>
                        <div class="mt-1.5 p-2 rounded-xl bg-slate-900 border border-emerald-500/30 flex items-center justify-between gap-2">
                            <span class="font-mono font-black text-white text-xs tracking-wider flex items-center gap-1.5">
                                <svg class="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                                </svg>
                                <span>${cardNum}</span>
                            </span>
                            <button type="button" onclick="navigator.clipboard.writeText('${cardNum}'); App.toast('تم نسخ رقم بطاقة الماستر كارد بنجاح', 'success')" class="px-2 py-0.5 rounded bg-emerald-600/30 text-emerald-300 text-[10px] font-bold shrink-0">
                                نسخ البطاقة
                            </button>
                        </div>
                    </td>
                    <td class="py-3 px-4 text-slate-400 font-mono text-xs">
                        ${w.created_at ? String(w.created_at).substring(0, 16).replace('T', ' ') : 'الآن'}
                    </td>
                    <td class="py-3 px-4 text-left">
                        ${w.status === 'pending' ? `
                            <div class="flex items-center gap-1.5 justify-end">
                                <button onclick="Admin.approveWithdrawal(${w.id}, ${w.amount})" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition">
                                    تأكيد تم التحويل
                                </button>
                                <button onclick="Admin.rejectWithdrawalPrompt(${w.id}, ${w.amount})" class="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition">
                                    رفض وإرجاع
                                </button>
                            </div>
                        ` : `
                            <span class="px-2.5 py-1 rounded-full text-xs font-bold ${w.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
                                ${w.status === 'approved' ? 'تم التحويل والصرف' : 'مرفوض'}
                            </span>
                        `}
                    </td>
                </tr>
            `;
            }).join('');
        } catch (e) {
            App.toast('تعذر جلب طابور السحوبات.', 'error');
        }
    };

    const approveWithdrawal = async (txId, amount) => {
        if (!confirm(`هل قمت بتحويل الحوالة المالية فعلياً لحساب العميل بمبلغ ${Number(amount).toLocaleString('en-US')} د.ع وتود تأكيد الصرف؟`)) return;

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
        const reason = prompt(`يرجى كتابة سبب رفض السحب (سيتم إرجاع ${Number(amount).toLocaleString('en-US')} د.ع فورياً إلى رصيد المستخدم المتاح):`, 'رقم المحفظة غير مسجل لدى المشغل');
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
                        ${Number(t.reward_amount).toLocaleString('en-US')} د.ع
                    </td>
                    <td class="py-3 px-4 text-slate-300 font-mono text-xs">
                        ${t.required_seconds} ثانية
                    </td>
                    <td class="py-3 px-4 text-slate-300 font-mono text-xs">
                        ${Number(t.completions_count).toLocaleString('en-US')} مرة
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
            const rawUsers = res.data.users || [];
            const users = rawUsers.filter(u => u.role !== 'admin');
            const tbody = document.getElementById('users-table-tbody');

            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-slate-500">لا يوجد مستخدمين مطابقين للبحث.</td></tr>`;
                return;
            }

            tbody.innerHTML = users.map(u => {
                const isActive = !u.status || u.status === 'active';
                const userPhone = u.phone || u.email || '—';
                const userBalance = Number(u.balance || 0);

                return `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition">
                    <td class="py-3 px-4 font-bold text-white">
                        <div>${u.full_name}</div>
                        <div class="text-[11px] text-slate-400 font-mono">${u.email}</div>
                    </td>
                    <td class="py-3 px-4 font-mono text-xs text-slate-300">
                        ${userPhone}
                    </td>
                    <td class="py-3 px-4 text-emerald-400 font-mono font-bold text-xs">
                        ${userBalance.toLocaleString('en-US')} د.ع
                    </td>
                    <td class="py-3 px-4 text-xs font-bold text-amber-400">
                        ${u.active_vip_name || 'الباقة المجانية'}
                    </td>
                    <td class="py-3 px-4 text-center">
                        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
                            ${isActive ? 'نشط' : 'معلق'}
                        </span>
                    </td>
                    <td class="py-3 px-4 text-left">
                        <div class="flex items-center gap-1.5 justify-end">
                            <button onclick="Admin.grantUserVipPrompt(${u.id}, '${u.full_name}')" class="px-2 py-1 rounded bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-300 text-xs font-semibold transition flex items-center gap-1" title="منح باقة VIP">
                                <svg class="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/>
                                </svg>
                                <span>ترقية VIP</span>
                            </button>
                            <button onclick="Admin.assignTaskToUser(${u.id}, '${u.full_name}')" class="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold transition" title="إسناد مهمة موجهة">
                                إسناد مهمة
                            </button>
                            <button onclick="Admin.openBalanceModal(${u.id}, '${u.full_name}', ${userBalance})" class="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-semibold transition">
                                تعديل الرصيد
                            </button>
                            <button onclick="Admin.toggleUserStatus(${u.id}, '${isActive ? 'suspended' : 'active'}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition">
                                ${isActive ? 'تجميد' : 'تفعيل'}
                            </button>
                        </div>
                    </td>
                </tr>
                `;
            }).join('');
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

    /**
     * Grant VIP Subscription to a user directly from Admin Panel
     */
    const grantUserVipPrompt = async (userId, userName) => {
        const choice = prompt(
            `منح باقة VIP للمستخدم: ${userName}\n\nاختر رقم باقة VIP المراد تفعيلها (لمدة 30 يوماً):\n` +
            `1: برونزية (VIP 1 - 250 د.ع/يوم)\n` +
            `2: فضية (VIP 2 - 500 د.ع/يوم)\n` +
            `3: ذهبية (VIP 3 - 1,000 د.ع/يوم)\n` +
            `4: بلاتينية (VIP 4 - 2,000 د.ع/يوم)\n` +
            `5: ماسية (VIP 5 - 4,000 د.ع/يوم)\n\nأدخل الرقم (1 إلى 5):`,
            '1'
        );

        if (!choice) return;

        const pkgMap = {
            '1': 2, // VIP 1 (package_id: 2)
            '2': 3, // VIP 2 (package_id: 3)
            '3': 4, // VIP 3 (package_id: 4)
            '4': 5, // VIP 4 (package_id: 5)
            '5': 6  // VIP 5 (package_id: 6)
        };

        const packageId = pkgMap[choice.trim()];
        if (!packageId) {
            App.toast('اختيار غير صالح، يرجى إدخال رقم من 1 إلى 5.', 'warning');
            return;
        }

        try {
            const res = await API.post('admin/users/grant-vip', {
                user_id: userId,
                package_id: packageId,
                duration_days: 30
            });
            App.toast(res.message, 'success');
            loadUsers();
            loadAnalytics();
        } catch (err) {
            App.toast(err.message, 'error');
        }
    };

    const openBalanceModal = (userId, name, currentBalance) => {
        const modal = document.getElementById('user-balance-modal');
        document.getElementById('balance-modal-user-id').value = userId;
        document.getElementById('balance-modal-user-name').textContent = name;
        document.getElementById('balance-modal-current').textContent = `${Number(currentBalance).toLocaleString('en-US')} د.ع`;

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
            const s = (res.data && res.data.settings) ? res.data.settings : {};

            const mcNumEl = document.getElementById('set-mastercard-number');
            const mcHolderEl = document.getElementById('set-mastercard-holder');
            const nameEl = document.getElementById('set-name');
            const asiaInstEl = document.getElementById('set-asiacell-instructions');
            const minDepEl = document.getElementById('set-min-dep');
            const minWithEl = document.getElementById('set-min-with');

            if (mcNumEl) mcNumEl.value = s.mastercard_number || '5300 1234 5678 9012';
            if (mcHolderEl) mcHolderEl.value = s.mastercard_holder || s.official_account_name || 'شركة مهام للخدمات المالية ذ.م.م';
            if (nameEl) nameEl.value = s.official_account_name || s.mastercard_holder || 'شركة مهام للتكنولوجيا والخدمات المالية ذ.م.م';
            if (asiaInstEl) asiaInstEl.value = s.asiacell_instructions || 'أدخل قيمة الرصيد ورقم كارت الشحن المكون من 14 رقماً ثم اضغط تأكيد الإيداع (بدون الحاجة لرفع أي صورة إشعار).';
            if (minDepEl) minDepEl.value = s.min_deposit_iqd || 5000;
            if (minWithEl) minWithEl.value = s.min_withdraw_iqd || 10000;
        } catch (e) {
            App.toast('تعذر جلب إعدادات المنصة.', 'error');
        }
    };

    const handleSettingsSubmit = async (e) => {
        e.preventDefault();
        const payload = {
            mastercard_number: (document.getElementById('set-mastercard-number')?.value || '').trim(),
            mastercard_holder: (document.getElementById('set-mastercard-holder')?.value || '').trim(),
            official_account_name: (document.getElementById('set-name')?.value || document.getElementById('set-mastercard-holder')?.value || '').trim(),
            asiacell_instructions: (document.getElementById('set-asiacell-instructions')?.value || '').trim(),
            min_deposit_iqd: document.getElementById('set-min-dep')?.value || 5000,
            min_withdraw_iqd: document.getElementById('set-min-with')?.value || 10000
        };

        try {
            const res = await API.post('admin/settings/update', payload);
            App.toast(res.message || 'تم حفظ وتحديث الإعدادات بنجاح.', 'success');
        } catch (err) {
            App.toast(err.message || 'فشل حفظ الإعدادات.', 'error');
        }
    };

    const handleLogout = async () => {
        API.clearAuthToken();
        try {
            await API.post('auth/logout');
        } catch (e) {}
        currentAdmin = null;
        showAuthRequired('تم تسجيل الخروج من لوحة الإدارة.');
    };

    return {
        init,
        initTheme,
        toggleTheme,
        toggleSidebar,
        toggleMobileSidebar: toggleSidebar,
        handleAdminLogin,
        toggleLoginPasswordVisibility,
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
        grantUserVipPrompt,
        grantVipPrompt: grantUserVipPrompt,
        toggleUserStatus,
        openBalanceModal,
        closeBalanceModal,
        handleBalanceSubmit,
        handleSettingsSubmit,
        showAuthRequired,
        toast: adminToast
    };
})();

// Explicitly expose on window for reliable global invocation
window.Admin = Admin;

document.addEventListener('DOMContentLoaded', () => {
    Admin.init();
});

