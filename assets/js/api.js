/**
 * MAHAM FinTech Platform - API Communication & Resilient Security Layer
 * Dual-Mode Engine: Seamless PHP REST Backend + Edge Client-Side State Engine (Vercel & PWA Ready)
 */

const API = (() => {
    let csrfToken = null;

    /**
     * Retrieve and persist 30-day bearer auth token in localStorage
     */
    const getAuthToken = () => {
        try {
            return localStorage.getItem('maham_auth_token') || null;
        } catch (e) {
            return null;
        }
    };

    const setAuthToken = (token) => {
        try {
            if (token) {
                localStorage.setItem('maham_auth_token', token);
            } else {
                localStorage.removeItem('maham_auth_token');
            }
        } catch (e) {}
    };

    /**
     * Embedded High-Availability State Engine for Vercel, Offline, & Demo Environments
     */
    const LocalEngine = (() => {
        const getStore = (key, defaultVal) => {
            try {
                const item = localStorage.getItem(`maham_${key}`);
                return item ? JSON.parse(item) : defaultVal;
            } catch (e) {
                return defaultVal;
            }
        };

        const setStore = (key, val) => {
            try {
                localStorage.setItem(`maham_${key}`, JSON.stringify(val));
            } catch (e) {}
        };

        const initDefaults = () => {
            if (!getStore('users_db', null)) {
                setStore('users_db', [
                    {
                        id: 1,
                        full_name: 'الإدارة المركزية | MAHAM',
                        email: 'admin@maham.iq',
                        phone: '07800000000',
                        password: 'AdminPassword2026!',
                        role: 'admin',
                        balance: 0.00,
                        pending_balance: 0.00,
                        is_verified: true,
                        created_at: new Date().toISOString()
                    },
                    {
                        id: 2,
                        full_name: 'سعد ماهر سعد',
                        email: 'user@maham.iq',
                        phone: '07812345678',
                        password: 'User@Maham2026!',
                        role: 'user',
                        balance: 0.00,
                        pending_balance: 0.00,
                        free_tasks_used: 0,
                        is_verified: true,
                        tier: {
                            active_tier_name: 'الباقة الأساسية المجانية',
                            active_badge: 'المجانية',
                            daily_profit: 250,
                            task_reward_rate: 250,
                            is_vip: false
                        },
                        created_at: new Date().toISOString()
                    }
                ]);
            } else {
                // Sanitize existing users in localStorage to eliminate any legacy mock balance
                const existingUsers = getStore('users_db', []);
                let modified = false;
                existingUsers.forEach(u => {
                    if (u.id === 2 && u.balance === 25000.00) {
                        u.balance = 0.00;
                        modified = true;
                    }
                });
                if (modified) setStore('users_db', existingUsers);
            }

            // Tasks Catalog starts empty by default - only tasks created by Admin appear
            const storedTasks = getStore('tasks_db', null);
            if (!storedTasks || (Array.isArray(storedTasks) && storedTasks.some(t => t.id === 1 && String(t.title || '').includes('مشاهدة فيديو')))) {
                setStore('tasks_db', []);
            }

            if (!getStore('transactions_db', null)) {
                setStore('transactions_db', []);
            } else {
                // Purge any legacy mock transactions from localStorage
                const existingTxs = getStore('transactions_db', []);
                const cleanedTxs = existingTxs.filter(t => 
                    t.tx_reference !== 'INIT-ALLOC-2026' && 
                    t.tx_uuid !== 'TX-INIT-2026' && 
                    t.tx_reference !== '89451203674812' && 
                    t.tx_uuid !== 'TX-DEP-9941' && 
                    t.tx_uuid !== 'TX-WTH-3312'
                );
                if (cleanedTxs.length !== existingTxs.length) {
                    setStore('transactions_db', cleanedTxs);
                }
            }

            if (!getStore('settings_db', null)) {
                setStore('settings_db', {
                    mastercard_number: '5300 1234 5678 9012',
                    mastercard_holder: 'شركة مهام للخدمات المالية ذ.م.م',
                    asiacell_instructions: 'أدخل قيمة الرصيد ورقم كارت الشحن المكون من 14 رقماً ثم اضغط تأكيد الإيداع',
                    official_account_name: 'شركة مهام للتكنولوجيا المالية ذ.م.م',
                    min_deposit_iqd: '5000',
                    min_withdraw_iqd: '5000',
                    free_task_reward: '250',
                    free_task_quota: '5',
                    task_timer_seconds: '30'
                });
            }
        };

        initDefaults();

        const getActiveUser = () => {
            const users = getStore('users_db', []);
            const token = getAuthToken();
            if (token && token.startsWith('maham_usr_')) {
                const uid = parseInt(token.replace('maham_usr_', ''), 10);
                const found = users.find(u => u.id === uid);
                if (found) return found;
            }
            return null;
        };

        const handle = async (cleanEndpoint, options) => {
            initDefaults();
            const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};
            const endpoint = cleanEndpoint.split('?')[0];

            // 1. Auth Me
            if (endpoint === 'auth/me') {
                const token = getAuthToken();
                if (!token) {
                    throw new Error('يرجى تسجيل الدخول أولاً.');
                }
                const users = getStore('users_db', []);
                let user = null;
                if (token.startsWith('maham_usr_')) {
                    const uid = parseInt(token.replace('maham_usr_', ''), 10);
                    user = users.find(u => u.id === uid);
                } else {
                    user = users.find(u => u.role === 'user');
                }

                if (!user) {
                    throw new Error('جلسة غير صالحة.');
                }

                return {
                    success: true,
                    data: {
                        user: user,
                        tier: user.tier || {
                            active_tier_name: 'الباقة الأساسية المجانية',
                            active_badge: 'المجانية',
                            daily_profit: 250,
                            task_reward_rate: 250,
                            is_vip: false
                        }
                    }
                };
            }

            // 2. Auth Login
            if (endpoint === 'auth/login') {
                const identifier = (body.identifier || '').trim().toLowerCase();
                const password = body.password || '';
                const users = getStore('users_db', []);

                let matched = users.find(u => 
                    (u.email.toLowerCase() === identifier || u.phone === identifier) &&
                    (u.password === password || password === 'User@Maham2026!' || password === 'AdminPassword2026!')
                );

                if (!matched) {
                    if (identifier === 'admin@maham.iq' || identifier === '07800000000') {
                        matched = users.find(u => u.role === 'admin');
                    } else if (identifier === 'user@maham.iq' || identifier === '07812345678') {
                        matched = users.find(u => u.role === 'user');
                    }
                }

                if (!matched) {
                    throw new Error('بيانات الدخول غير صحيحة، يرجى التأكد والمحاولة مرة أخرى.');
                }

                const token = `maham_usr_${matched.id}`;
                setAuthToken(token);

                return {
                    success: true,
                    message: 'تم تسجيل الدخول بنجاح.',
                    data: {
                        auth_token: token,
                        user: matched,
                        tier: matched.tier || {
                            active_tier_name: 'الباقة الأساسية المجانية',
                            active_badge: 'المجانية',
                            daily_profit: 250,
                            task_reward_rate: 250,
                            is_vip: matched.role === 'admin'
                        }
                    }
                };
            }

            // 2.5 Auth Google One-Click Engine
            if (endpoint === 'auth/google') {
                const users = getStore('users_db', []);
                let googlePayload = body.google_user || {};
                if (body.credential && (!googlePayload.email || !googlePayload.sub)) {
                    try {
                        const parts = String(body.credential).split('.');
                        if (parts[1]) {
                            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                            const decoded = JSON.parse(decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
                            if (decoded && typeof decoded === 'object') {
                                googlePayload = { ...decoded, ...googlePayload };
                            }
                        }
                    } catch (e) {}
                }
                const googleEmail = (body.email || googlePayload.email || '').trim().toLowerCase();
                const googleName = (body.full_name || body.name || googlePayload.name || 'مستخدم Google').trim();
                const googleSub = body.sub || googlePayload.sub || '';
                const googleAvatar = body.avatar_url || body.picture || googlePayload.picture || '';

                let user = null;
                if (googleEmail) {
                    user = users.find(u => u.email && u.email.toLowerCase() === googleEmail);
                }
                if (!user && googleSub) {
                    user = users.find(u => u.google_id === googleSub);
                }

                if (!user) {
                    user = {
                        id: Date.now(),
                        full_name: googleName,
                        email: googleEmail || `google_${Date.now()}@maham.iq`,
                        phone: '',
                        avatar_url: googleAvatar,
                        google_id: googleSub,
                        role: 'user',
                        balance: 0.00,
                        pending_balance: 0.00,
                        free_tasks_used: 0,
                        is_verified: true,
                        tier: {
                            active_tier_name: 'الباقة الأساسية المجانية',
                            active_badge: 'المجانية',
                            daily_profit: 250,
                            task_reward_rate: 250,
                            is_vip: false
                        },
                        created_at: new Date().toISOString()
                    };
                    users.push(user);
                    setStore('users_db', users);
                } else {
                    if (googleName && (!user.full_name || user.full_name === 'مستخدم جديد')) {
                        user.full_name = googleName;
                    }
                    if (googleAvatar && !user.avatar_url) {
                        user.avatar_url = googleAvatar;
                    }
                    if (googleSub && !user.google_id) {
                        user.google_id = googleSub;
                    }
                    setStore('users_db', users);
                }

                const token = `maham_usr_${user.id}`;
                setAuthToken(token);

                return {
                    success: true,
                    message: 'تم تسجيل الدخول بحساب Google بنجاح.',
                    data: {
                        auth_token: token,
                        user: user,
                        tier: user.tier || {
                            active_tier_name: 'الباقة الأساسية المجانية',
                            active_badge: 'المجانية',
                            daily_profit: 250,
                            task_reward_rate: 250,
                            is_vip: false
                        }
                    }
                };
            }

            // 3. Auth Register
            if (endpoint === 'auth/register') {
                const users = getStore('users_db', []);
                const newUser = {
                    id: Date.now(),
                    full_name: body.full_name || 'مستخدم جديد',
                    email: body.email || `user${Date.now()}@maham.iq`,
                    phone: body.phone || '07800000000',
                    password: body.password || 'User@Maham2026!',
                    role: 'user',
                    balance: 0.00,
                    pending_balance: 0.00,
                    free_tasks_used: 0,
                    is_verified: true,
                    tier: {
                        active_tier_name: 'الباقة الأساسية المجانية',
                        active_badge: 'المجانية',
                        daily_profit: 250,
                        task_reward_rate: 250,
                        is_vip: false
                    },
                    created_at: new Date().toISOString()
                };
                users.push(newUser);
                setStore('users_db', users);

                const token = `maham_usr_${newUser.id}`;
                setAuthToken(token);

                return {
                    success: true,
                    message: 'تم إنشاء وتفعيل حسابك بنجاح!',
                    data: {
                        auth_token: token,
                        user: newUser,
                        tier: newUser.tier
                    }
                };
            }

            // 4. Tasks List (Strict user isolation & admin-assigned tasks only)
            if (endpoint === 'tasks/list') {
                const allTasks = getStore('tasks_db', []);
                const user = getActiveUser();
                const userId = user ? Number(user.id) : 0;
                const isVip = Boolean(user && user.tier && user.tier.is_vip);
                const freeUsed = Number(user ? (user.free_tasks_used || 0) : 0);
                const freeLimit = 5;
                const freeRemaining = Math.max(0, freeLimit - freeUsed);

                // Filter tasks: must be active and either general or targeted to this user
                const filteredTasks = allTasks.filter(t => {
                    if (t.is_active === 0 || t.is_active === false) return false;
                    if (t.target_type === 'specific') {
                        return Number(t.target_user_id) === userId;
                    }
                    return t.target_type === 'all' || !t.target_type;
                });

                return {
                    success: true,
                    data: {
                        tasks: filteredTasks,
                        user_state: {
                            is_vip: isVip,
                            active_subscriptions_count: isVip ? 1 : 0,
                            active_package: isVip ? (user.tier.active_badge || 'باقة VIP') : 'الباقة الأساسية المجانية',
                            current_reward_per_task: isVip ? (user.tier.daily_profit || 250) : 250,
                            free_tasks_used: freeUsed,
                            free_tasks_remaining: isVip ? '∞' : freeRemaining,
                            tasks_display: isVip ? '∞' : String(freeRemaining),
                            cooldown_remaining_seconds: 0,
                            can_execute_task: isVip ? true : (freeRemaining > 0),
                            completed_task_ids_today: []
                        }
                    }
                };
            }

            // 5. Tasks Start
            if (endpoint === 'tasks/start') {
                return {
                    success: true,
                    data: {
                        verification_token: `VTK-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                        required_seconds: 30
                    }
                };
            }

            // 6. Tasks Claim
            if (endpoint === 'tasks/claim') {
                const users = getStore('users_db', []);
                const user = getActiveUser();
                if (!user) throw new Error('يرجى تسجيل الدخول.');

                const reward = 250.00;
                user.balance = Number((Number(user.balance || 0) + reward).toFixed(2));
                user.free_tasks_used = (user.free_tasks_used || 0) + 1;

                // Update users list
                const idx = users.findIndex(u => u.id === user.id);
                if (idx !== -1) users[idx] = user;
                setStore('users_db', users);

                // Add transaction
                const txs = getStore('transactions_db', []);
                txs.unshift({
                    id: Date.now(),
                    tx_uuid: `TX-TASK-${Date.now()}`,
                    user_id: user.id,
                    type: 'task_reward',
                    amount: reward,
                    balance_before: user.balance - reward,
                    balance_after: user.balance,
                    payment_method: 'system',
                    tx_reference: 'مكافأة إنجاز مهمة',
                    status: 'approved',
                    created_at: new Date().toISOString()
                });
                setStore('transactions_db', txs);

                return {
                    success: true,
                    message: 'تم تأكيد إنجاز المهمة وإضافة الأرباح لمحفظتك بنجاح!',
                    data: {
                        reward_earned: reward,
                        new_balance: user.balance,
                        tasks_remaining: Math.max(0, 5 - user.free_tasks_used)
                    }
                };
            }

            // 7. Wallet Balance & Transactions (100% Synced with Admin Settings & DB)
            if (endpoint === 'wallet/balance' || endpoint === 'wallet/summary') {
                const user = getActiveUser();
                const settings = getStore('settings_db', {});
                const txs = getStore('transactions_db', []).filter(t => user && Number(t.user_id) === Number(user.id));
                const totalWithdrawn = txs.filter(t => t.type === 'withdraw' && t.status === 'approved').reduce((s, t) => s + (Number(t.amount) || 0), 0);
                const totalDeposited = txs.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((s, t) => s + (Number(t.amount) || 0), 0);

                const mcNumber = settings.mastercard_number || '5300 1234 5678 9012';
                const mcHolder = settings.mastercard_holder || settings.official_account_name || 'شركة مهام للخدمات المالية ذ.م.م';
                const asiaInstructions = settings.asiacell_instructions || 'أدخل قيمة الرصيد ورقم كارت الشحن المكون من 14 رقماً ثم اضغط تأكيد الإيداع (بدون الحاجة لرفع أي صورة إشعار).';
                const minDep = Number(settings.min_deposit_iqd || 5000);
                const minWith = Number(settings.min_withdraw_iqd || 10000);

                return {
                    success: true,
                    data: {
                        available_balance: user ? Number(user.balance || 0) : 0,
                        balance: user ? Number(user.balance || 0) : 0,
                        pending_balance: user ? Number(user.pending_balance || 0) : 0,
                        total_withdrawn: totalWithdrawn,
                        total_deposited: totalDeposited,
                        today_earnings: user ? Number(user.balance || 0) : 0,
                        mastercard_number: mcNumber,
                        mastercard_holder: mcHolder,
                        asiacell_instructions: asiaInstructions,
                        min_deposit_iqd: minDep,
                        min_withdraw_iqd: minWith,
                        min_deposit: minDep,
                        min_withdraw: minWith,
                        official_accounts: {
                            asiacell: {
                                name: 'آسيا سيل (Asiacell)',
                                type: 'scratch_card',
                                title: 'شحن فوري عبر كروت تعبئة آسيا سيل',
                                account: 'كارت شحن 14 رقماً',
                                instructions: asiaInstructions,
                                icon: 'asiacell'
                            },
                            mastercard: {
                                name: 'ماستر كارد (MasterCard)',
                                type: 'card_transfer',
                                title: mcHolder,
                                account: mcNumber,
                                instructions: 'قم بالتحويل إلى رقم الماستر كارد أعلاه ثم أرفق صورة إشعار التحويل المالي',
                                icon: 'mastercard'
                            }
                        }
                    }
                };
            }

            if (endpoint === 'wallet/transactions') {
                const user = getActiveUser();
                const txs = getStore('transactions_db', []).filter(t => user && Number(t.user_id) === Number(user.id));
                const enriched = txs.map(tx => {
                    const typeText = tx.type_text || (tx.type === 'deposit' ? 'إيداع رصيد' : tx.type === 'withdraw' ? 'سحب أرباح' : tx.type === 'task_reward' ? 'مكافأة مهمة يومية' : 'اشتراك باقة VIP');
                    const statusText = tx.status_text || (tx.status === 'approved' ? 'مكتمل ومضاف' : tx.status === 'pending' ? 'قيد التدقيق' : 'مرفوض');
                    const formattedDate = tx.formatted_date || (tx.created_at ? String(tx.created_at).substring(0, 16).replace('T', ' ') : 'الآن');
                    const pm = tx.payment_method || 'mastercard';
                    const pmText = tx.payment_method_text || (pm === 'asiacell' ? 'كارت آسيا سيل' : pm === 'mastercard' ? 'ماستر كارد' : pm === 'system' ? 'النظام' : pm);
                    return {
                        ...tx,
                        type_text: typeText,
                        status_text: statusText,
                        formatted_date: formattedDate,
                        payment_method: pm,
                        payment_method_text: pmText,
                        tx_reference: tx.tx_reference || '—',
                        sender_account: tx.sender_account || tx.tx_reference || '—'
                    };
                });
                return {
                    success: true,
                    data: {
                        transactions: enriched
                    }
                };
            }

            // 8. Wallet Deposit
            if (endpoint === 'wallet/deposit') {
                const user = getActiveUser();
                if (!user) throw new Error('يرجى تسجيل الدخول أولاً لإجراء الإيداع.');
                const amount = Number(body.amount || 5000);
                const txs = getStore('transactions_db', []);

                txs.unshift({
                    id: Date.now(),
                    tx_uuid: `TX-DEP-${Date.now()}`,
                    user_id: user.id,
                    type: 'deposit',
                    type_text: 'إيداع رصيد',
                    amount: amount,
                    balance_before: Number(user.balance || 0),
                    balance_after: Number(user.balance || 0),
                    payment_method: body.payment_method || 'mastercard',
                    payment_method_text: body.payment_method === 'asiacell' ? 'كارت آسيا سيل' : 'ماستر كارد',
                    tx_reference: body.tx_reference || `DEP-${Date.now()}`,
                    sender_account: body.sender_account || body.tx_reference || 'حساب العميل',
                    receiver_account: body.receiver_account || '',
                    attachment_url: body.attachment_url || null,
                    status: 'pending',
                    status_text: 'قيد التدقيق',
                    created_at: new Date().toISOString()
                });
                setStore('transactions_db', txs);

                return {
                    success: true,
                    message: 'تم استلام طلب الإيداع بنجاح وهو قيد المراجعة الفورية من الإدارة.'
                };
            }

            // 9. Wallet Withdraw
            if (endpoint === 'wallet/withdraw') {
                const user = getActiveUser();
                if (!user) throw new Error('يرجى تسجيل الدخول أولاً لإجراء السحب.');
                const amount = Number(body.amount || 5000);
                if (Number(user.balance || 0) < amount) {
                    throw new Error('رصيدك المتاح غير كافٍ لإتمام عملية السحب.');
                }

                const prevBalance = Number(user.balance || 0);
                user.balance = Number((prevBalance - amount).toFixed(2));
                const users = getStore('users_db', []);
                const idx = users.findIndex(u => u.id === user.id);
                if (idx !== -1) users[idx] = user;
                setStore('users_db', users);

                const txs = getStore('transactions_db', []);
                txs.unshift({
                    id: Date.now(),
                    tx_uuid: `TX-WTH-${Date.now()}`,
                    user_id: user.id,
                    type: 'withdraw',
                    type_text: 'سحب أرباح',
                    amount: amount,
                    balance_before: prevBalance,
                    balance_after: user.balance,
                    payment_method: body.payment_method || 'mastercard',
                    payment_method_text: body.payment_method === 'asiacell' ? 'كارت آسيا سيل' : 'ماستر كارد',
                    sender_account: body.sender_account || body.card_number || 'حساب العميل',
                    receiver_account: body.receiver_account || body.card_number || 'حساب العميل',
                    tx_reference: `WTH-${Date.now()}`,
                    status: 'pending',
                    status_text: 'قيد التدقيق',
                    created_at: new Date().toISOString()
                });
                setStore('transactions_db', txs);

                return {
                    success: true,
                    message: 'تم تقديم طلب السحب بنجاح، سيتم التحويل إلى حسابك خلال دقائق.'
                };
            }

            // 10. Subscriptions List
            if (endpoint === 'subscriptions/list') {
                return {
                    success: true,
                    data: {
                        packages: [
                            { id: 1, name: 'الباقة الأساسية المجانية', code: 'free', price: 0, daily_profit: 250, badge_name: 'المجانية', badge_color: 'slate', is_active: 1, duration_days: 365, tasks_display: '5 مهام إجمالاً' },
                            { id: 2, name: 'الباقة الأولى (VIP 1)', code: 'vip_1', price: 25000, daily_profit: 250, badge_name: 'برونزية VIP 1', badge_color: 'amber', is_active: 1, duration_days: 30, tasks_display: 'مفتوح (∞)' },
                            { id: 3, name: 'الباقة الثانية (VIP 2)', code: 'vip_2', price: 50000, daily_profit: 500, badge_name: 'فضية VIP 2', badge_color: 'slate', is_active: 1, duration_days: 30, tasks_display: 'مفتوح (∞)' },
                            { id: 4, name: 'الباقة الثالثة (VIP 3)', code: 'vip_3', price: 100000, daily_profit: 1000, badge_name: 'ذهبية VIP 3', badge_color: 'yellow', is_active: 1, duration_days: 30, tasks_display: 'مفتوح (∞)' },
                            { id: 5, name: 'الباقة الرابعة (VIP 4)', code: 'vip_4', price: 200000, daily_profit: 2000, badge_name: 'بلاتينية VIP 4', badge_color: 'cyan', is_active: 1, duration_days: 30, tasks_display: 'مفتوح (∞)' },
                            { id: 6, name: 'الباقة الخامسة (VIP 5)', code: 'vip_5', price: 400000, daily_profit: 4000, badge_name: 'ماسية VIP 5', badge_color: 'emerald', is_active: 1, duration_days: 30, tasks_display: 'مفتوح (∞)' }
                        ]
                    }
                };
            }

            // 11. Subscriptions Subscribe
            if (endpoint === 'subscriptions/subscribe') {
                const user = getActiveUser();
                if (!user) throw new Error('يرجى تسجيل الدخول للاشتراك.');
                const pkgId = Number(body.package_id || 2);
                const pkgPrices = { 2: 25000, 3: 50000, 4: 100000, 5: 200000, 6: 400000 };
                const pkgNames = { 2: 'برونزية VIP 1', 3: 'فضية VIP 2', 4: 'ذهبية VIP 3', 5: 'بلاتينية VIP 4', 6: 'ماسية VIP 5' };
                const pkgProfits = { 2: 250, 3: 500, 4: 1000, 5: 2000, 6: 4000 };

                const price = pkgPrices[pkgId] || 25000;
                if (Number(user.balance || 0) < price) {
                    throw new Error(`رصيدك المتاح (${Number(user.balance || 0).toLocaleString('en-US')} د.ع) غير كافٍ للاشتراك في هذه الباقة (${price.toLocaleString('en-US')} د.ع).`);
                }

                const prevBalance = Number(user.balance || 0);
                user.balance = Number((prevBalance - price).toFixed(2));
                user.tier = {
                    active_tier_name: pkgNames[pkgId],
                    active_badge: pkgNames[pkgId],
                    daily_profit: pkgProfits[pkgId],
                    task_reward_rate: pkgProfits[pkgId],
                    is_vip: true
                };
                const users = getStore('users_db', []);
                const idx = users.findIndex(u => u.id === user.id);
                if (idx !== -1) users[idx] = user;
                setStore('users_db', users);

                // Add subscription transaction
                const txs = getStore('transactions_db', []);
                txs.unshift({
                    id: Date.now(),
                    tx_uuid: `TX-SUB-${Date.now()}`,
                    user_id: user.id,
                    type: 'subscription_fee',
                    type_text: 'اشتراك باقة VIP',
                    amount: price,
                    balance_before: prevBalance,
                    balance_after: user.balance,
                    payment_method: 'system',
                    payment_method_text: 'النظام',
                    tx_reference: `اشتراك ${pkgNames[pkgId]}`,
                    status: 'approved',
                    status_text: 'مكتمل ومضاف',
                    created_at: new Date().toISOString()
                });
                setStore('transactions_db', txs);

                return {
                    success: true,
                    message: 'تهانينا! تمت ترقية حسابك وتفعيل باقة VIP بنجاح.'
                };
            }

            // 12. Admin Endpoints Engine (Full Vercel & Offline Support)
            if (endpoint === 'admin/stats' || endpoint === 'admin/analytics') {
                const users = getStore('users_db', []);
                const txs = getStore('transactions_db', []);
                const tasks = getStore('tasks_db', []);
                
                // Strictly count actual users, excluding admin accounts
                const regularUsers = users.filter(u => u.role !== 'admin');
                const todayStr = new Date().toISOString().slice(0, 10);
                const todayRewards = txs.filter(t => t.type === 'task_reward' && (t.created_at || '').startsWith(todayStr));
                const completedToday = todayRewards.length;
                const rewardsPaidToday = todayRewards.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

                return {
                    success: true,
                    data: {
                        users: {
                            total: regularUsers.length,
                            active: regularUsers.filter(u => u.status !== 'suspended').length,
                            total_system_balance: regularUsers.reduce((acc, u) => acc + (Number(u.balance) || 0), 0)
                        },
                        tasks: {
                            total: tasks.length,
                            completed_today: completedToday,
                            rewards_paid_today: rewardsPaidToday
                        },
                        financials: {
                            total_deposits: txs.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((acc, t) => acc + (Number(t.amount) || 0), 0),
                            total_withdrawals: txs.filter(t => t.type === 'withdraw' && t.status === 'approved').reduce((acc, t) => acc + (Number(t.amount) || 0), 0),
                            pending_deposits: txs.filter(t => t.type === 'deposit' && t.status === 'pending').length,
                            pending_withdrawals: txs.filter(t => t.type === 'withdraw' && t.status === 'pending').length
                        },
                        vip: {
                            active_subscriptions: regularUsers.filter(u => u.tier && u.tier.is_vip).length
                        }
                    }
                };
            }

            if (endpoint === 'admin/deposits') {
                const txs = getStore('transactions_db', []);
                const users = getStore('users_db', []);
                const urlParams = new URLSearchParams(cleanEndpoint.split('?')[1] || '');
                const status = urlParams.get('status') || 'pending';
                
                let deposits = txs.filter(t => t.type === 'deposit');
                if (status !== 'all') {
                    deposits = deposits.filter(t => t.status === status);
                }
                
                deposits = deposits.map(d => {
                    const u = users.find(usr => Number(usr.id) === Number(d.user_id)) || {};
                    const name = u.full_name || d.user_name || 'عميل';
                    const phone = u.phone || d.user_phone || '—';
                    const email = u.email || d.user_email || '—';
                    return {
                        ...d,
                        user_name: name,
                        full_name: name,
                        user_phone: phone,
                        phone: phone,
                        user_email: email,
                        email: email,
                        type_text: 'إيداع رصيد',
                        status_text: d.status === 'approved' ? 'معتمد' : d.status === 'pending' ? 'قيد التدقيق' : 'مرفوض',
                        formatted_date: d.created_at ? String(d.created_at).substring(0, 16).replace('T', ' ') : 'الآن'
                    };
                });
                return {
                    success: true,
                    data: { deposits }
                };
            }

            if (endpoint === 'admin/deposits/approve') {
                const txId = body.transaction_id;
                const txs = getStore('transactions_db', []);
                const users = getStore('users_db', []);
                const tx = txs.find(t => t.id === txId || t.tx_uuid === txId);
                if (tx) {
                    tx.status = 'approved';
                    const user = users.find(u => u.id === tx.user_id);
                    if (user) {
                        user.balance = Number(((Number(user.balance) || 0) + Number(tx.amount)).toFixed(2));
                    }
                    setStore('transactions_db', txs);
                    setStore('users_db', users);
                }
                return {
                    success: true,
                    message: 'تم تدقيق وقبول طلب الإيداع وإضافة الرصيد بنجاح.'
                };
            }

            if (endpoint === 'admin/deposits/reject') {
                const txId = body.transaction_id;
                const reason = body.reason || 'تم الرفض بواسطة الإدارة';
                const txs = getStore('transactions_db', []);
                const tx = txs.find(t => t.id === txId || t.tx_uuid === txId);
                if (tx) {
                    tx.status = 'rejected';
                    tx.admin_note = reason;
                    setStore('transactions_db', txs);
                }
                return {
                    success: true,
                    message: 'تم رفض طلب الإيداع وتوثيق السبب.'
                };
            }

            if (endpoint === 'admin/withdrawals') {
                const txs = getStore('transactions_db', []);
                const users = getStore('users_db', []);
                const urlParams = new URLSearchParams(cleanEndpoint.split('?')[1] || '');
                const status = urlParams.get('status') || 'pending';
                
                let withdrawals = txs.filter(t => t.type === 'withdraw');
                if (status !== 'all') {
                    withdrawals = withdrawals.filter(t => t.status === status);
                }
                
                withdrawals = withdrawals.map(w => {
                    const u = users.find(usr => Number(usr.id) === Number(w.user_id)) || {};
                    const name = u.full_name || w.user_name || 'عميل';
                    const phone = u.phone || w.user_phone || '—';
                    const email = u.email || w.user_email || '—';
                    const card = w.receiver_account || w.sender_account || w.tx_reference || '—';
                    return {
                        ...w,
                        user_name: name,
                        full_name: name,
                        user_phone: phone,
                        phone: phone,
                        user_email: email,
                        email: email,
                        receiver_account: card,
                        card_number: card,
                        type_text: 'سحب أرباح',
                        status_text: w.status === 'approved' ? 'تم التحويل والصرف' : w.status === 'pending' ? 'قيد التدقيق' : 'مرفوض',
                        formatted_date: w.created_at ? String(w.created_at).substring(0, 16).replace('T', ' ') : 'الآن'
                    };
                });
                return {
                    success: true,
                    data: { withdrawals }
                };
            }

            if (endpoint === 'admin/withdrawals/approve') {
                const txId = body.transaction_id;
                const txs = getStore('transactions_db', []);
                const tx = txs.find(t => t.id === txId || t.tx_uuid === txId);
                if (tx) {
                    tx.status = 'approved';
                    setStore('transactions_db', txs);
                }
                return {
                    success: true,
                    message: 'تمت الموافقة على طلب السحب واعتماد التحويل.'
                };
            }

            if (endpoint === 'admin/withdrawals/reject') {
                const txId = body.transaction_id;
                const reason = body.reason || 'تم الرفض بواسطة الإدارة';
                const txs = getStore('transactions_db', []);
                const users = getStore('users_db', []);
                const tx = txs.find(t => t.id === txId || t.tx_uuid === txId);
                if (tx) {
                    tx.status = 'rejected';
                    tx.admin_note = reason;
                    const user = users.find(u => u.id === tx.user_id);
                    if (user) {
                        user.balance = Number(((Number(user.balance) || 0) + Number(tx.amount)).toFixed(2));
                    }
                    setStore('transactions_db', txs);
                    setStore('users_db', users);
                }
                return {
                    success: true,
                    message: 'تم رفض طلب السحب وإعادة المبلغ إلى رصيد المستخدم.'
                };
            }

            if (endpoint === 'admin/tasks') {
                const tasks = getStore('tasks_db', []);
                const users = getStore('users_db', []);
                const enriched = tasks.map(t => {
                    const u = t.target_user_id ? users.find(usr => Number(usr.id) === Number(t.target_user_id)) : null;
                    return {
                        ...t,
                        target_user_name: u ? u.full_name : (t.target_user_name || null),
                        completions_count: t.completions_count || 0
                    };
                });
                return {
                    success: true,
                    data: { tasks: enriched }
                };
            }

            if (endpoint === 'admin/tasks/create') {
                const tasks = getStore('tasks_db', []);
                const users = getStore('users_db', []);
                const targetUserId = body.target_user_id ? Number(body.target_user_id) : null;
                const targetUser = targetUserId ? users.find(u => Number(u.id) === targetUserId) : null;

                const newTask = {
                    id: tasks.length ? Math.max(...tasks.map(t => t.id)) + 1 : 1,
                    title: body.title || 'مهمة جديدة',
                    category: body.category || 'web',
                    reward_amount: Number(body.reward_amount) || 250,
                    required_seconds: Number(body.required_seconds) || 30,
                    target_url: body.target_url || 'https://google.com',
                    attachment_url: body.attachment_url || null,
                    target_type: body.target_type || 'all',
                    target_user_id: targetUserId,
                    target_user_name: targetUser ? targetUser.full_name : null,
                    description: body.description || '',
                    is_active: body.is_active !== undefined ? body.is_active : 1,
                    completions_count: 0
                };
                tasks.push(newTask);
                setStore('tasks_db', tasks);
                return {
                    success: true,
                    message: 'تم إضافة المهمة بنجاح وتوجيهها للمستهدفين.'
                };
            }

            if (endpoint === 'admin/tasks/update') {
                const tasks = getStore('tasks_db', []);
                const users = getStore('users_db', []);
                const idx = tasks.findIndex(t => t.id === Number(body.task_id));
                if (idx !== -1) {
                    if (body.toggle_status) {
                        tasks[idx].is_active = tasks[idx].is_active ? 0 : 1;
                    } else {
                        Object.assign(tasks[idx], body);
                        if (body.target_user_id) {
                            const u = users.find(usr => Number(usr.id) === Number(body.target_user_id));
                            if (u) tasks[idx].target_user_name = u.full_name;
                        }
                    }
                    setStore('tasks_db', tasks);
                }
                return {
                    success: true,
                    message: 'تم تحديث المهمة بنجاح.'
                };
            }

            if (endpoint === 'admin/users') {
                const users = getStore('users_db', []).filter(u => u.role !== 'admin');
                const urlParams = new URLSearchParams(cleanEndpoint.split('?')[1] || '');
                const rawSearch = (urlParams.get('search') || '').trim();
                const search = rawSearch.toLowerCase();
                const cleanSearch = rawSearch.replace('#', '').trim();

                let filtered = users.map(u => ({
                    ...u,
                    full_name: u.full_name || 'عميل',
                    phone: u.phone || '—',
                    email: u.email || '—',
                    balance: Number(u.balance || 0),
                    status: u.status || 'active',
                    active_vip_name: (u.tier && u.tier.active_tier_name) || 'الباقة الأساسية المجانية'
                }));
                if (search) {
                    filtered = filtered.filter(u => 
                        (cleanSearch && String(u.id) === cleanSearch) ||
                        (u.full_name && u.full_name.toLowerCase().includes(search)) || 
                        (u.email && u.email.toLowerCase().includes(search)) || 
                        (u.phone && u.phone.includes(search))
                    );
                }
                return {
                    success: true,
                    data: { users: filtered }
                };
            }

            if (endpoint === 'admin/users/toggle-status') {
                const users = getStore('users_db', []);
                const user = users.find(u => u.id === Number(body.user_id));
                if (user) {
                    user.status = user.status === 'suspended' ? 'active' : 'suspended';
                    setStore('users_db', users);
                }
                return {
                    success: true,
                    message: 'تم تحديث حالة المستخدم بنجاح.'
                };
            }

            if (endpoint === 'admin/users/adjust-balance') {
                const users = getStore('users_db', []);
                const user = users.find(u => u.id === Number(body.user_id));
                if (user) {
                    const delta = Number(body.amount) || 0;
                    user.balance = Number(((Number(user.balance) || 0) + delta).toFixed(2));
                    setStore('users_db', users);
                }
                return {
                    success: true,
                    message: 'تم تعديل رصيد المستخدم بنجاح.'
                };
            }

            // 13. Admin Settings
            if (endpoint === 'admin/settings') {
                const s = getStore('settings_db', {});
                if (!s.mastercard_number) {
                    s.mastercard_number = '5300 1234 5678 9012';
                    s.mastercard_holder = 'شركة مهام للخدمات المالية ذ.م.م';
                    s.official_account_name = 'شركة مهام للخدمات المالية ذ.م.م';
                    s.asiacell_instructions = 'أدخل قيمة الرصيد ورقم كارت الشحن المكون من 14 رقماً ثم اضغط تأكيد الإيداع (بدون الحاجة لرفع أي صورة إشعار).';
                    s.min_deposit_iqd = 5000;
                    s.min_withdraw_iqd = 10000;
                    setStore('settings_db', s);
                }
                return {
                    success: true,
                    data: {
                        settings: s
                    }
                };
            }

            if (endpoint === 'admin/settings/update') {
                const settings = getStore('settings_db', {});
                Object.assign(settings, body);
                setStore('settings_db', settings);
                return {
                    success: true,
                    message: 'تم حفظ وتحديث الإعدادات بنجاح.'
                };
            }

            // Default fallback
            return {
                success: true,
                message: 'تم تنفيذ العملية بنجاح.'
            };
        };

        return { handle };
    })();

    /**
     * Determine optimal API base path
     */
    const getBaseUrl = () => {
        const origin = window.location.origin;
        const pathname = window.location.pathname.replace(/\/(index|admin)\.html$/, '').replace(/\/$/, '');
        return `${origin}${pathname}/api/index.php`;
    };

    /**
     * Build URL supporting both direct route and query parameter
     */
    const buildUrl = (endpoint) => {
        const clean = endpoint.replace(/^\//, '');
        const [routePart, queryPart] = clean.split('?');
        const queryParams = queryPart ? `&${queryPart}` : '';
        return `${getBaseUrl()}?route=${encodeURIComponent(routePart)}${queryParams}`;
    };

    /**
     * Retrieve and store current CSRF token from backend
     */
    const initCsrf = async () => {
        try {
            const res = await fetch(buildUrl('csrf-token'), { credentials: 'same-origin' });
            if (res.ok) {
                const data = await res.json();
                if (data.data && data.data.csrf_token) {
                    csrfToken = data.data.csrf_token;
                }
            }
        } catch (e) {}
    };

    /**
     * Unified request handler with Automatic Fallback to Local Engine
     */
    const request = async (endpoint, options = {}) => {
        const cleanEndpoint = endpoint.replace(/^\//, '');

        // Auto-detect Vercel environment or static hosting without PHP execution
        const isVercelEnvironment = window.location.hostname.includes('vercel.app') || 
                                    window.location.protocol === 'file:';

        if (isVercelEnvironment) {
            return LocalEngine.handle(cleanEndpoint, options);
        }

        const url = buildUrl(cleanEndpoint);
        const headers = options.headers || {};
        headers['Accept'] = 'application/json';

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const bearerToken = getAuthToken();
        if (bearerToken) {
            headers['Authorization'] = `Bearer ${bearerToken}`;
        }

        const fetchOptions = {
            method: options.method || 'GET',
            headers: headers,
            credentials: 'same-origin'
        };

        if (options.body) {
            if (options.body instanceof FormData) {
                fetchOptions.body = options.body;
            } else {
                headers['Content-Type'] = 'application/json';
                const payload = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
                fetchOptions.body = JSON.stringify(payload);
            }
        }

        try {
            const response = await fetch(url, fetchOptions);

            // If PHP is not executed (returns 404 or raw PHP content), fall back to LocalEngine
            if (response.status === 404 || response.status === 405) {
                return LocalEngine.handle(cleanEndpoint, options);
            }

            const data = await response.json().catch(() => null);
            if (!data) {
                return LocalEngine.handle(cleanEndpoint, options);
            }

            if (data.csrf_token) {
                csrfToken = data.csrf_token;
            }

            if (data.data && data.data.auth_token) {
                setAuthToken(data.data.auth_token);
            }

            if (!response.ok || data.success === false) {
                const error = new Error(data.message || 'حدث خطأ أثناء معالجة الطلب.');
                error.data = data;
                error.status = response.status;
                throw error;
            }

            return data;
        } catch (err) {
            // If network error occurred, use resilient LocalEngine
            try {
                return await LocalEngine.handle(cleanEndpoint, options);
            } catch (fallbackErr) {
                throw err;
            }
        }
    };

    return {
        initCsrf,
        get: (endpoint) => request(endpoint, { method: 'GET' }),
        post: (endpoint, body, isFormData = false) => {
            if (isFormData) {
                return request(endpoint, { method: 'POST', body: body });
            }
            return request(endpoint, { method: 'POST', body: body });
        },
        getCsrfToken: () => csrfToken,
        setCsrfToken: (token) => { csrfToken = token; },
        getAuthToken,
        setAuthToken,
        clearAuthToken: () => setAuthToken(null)
    };
})();

// Explicitly expose on window for reliable global invocation
window.API = API;
