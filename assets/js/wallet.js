/**
 * MAHAM FinTech Platform - Wallet, Manual Deposits & Payout Controller
 * Manages receipts upload, payment methods clipboard, and transactions ledger
 */

const Wallet = (() => {
    let officialAccounts = {};
    let selectedPaymentMethod = 'zain_cash';
    let selectedReceiptFile = null;

    /**
     * Load Wallet Data & Transactions Ledger
     */
    const load = async () => {
        try {
            const [balanceRes, txRes] = await Promise.all([
                API.get('wallet/balance'),
                API.get('wallet/transactions')
            ]);

            const balances = balanceRes.data;
            officialAccounts = balances.official_accounts || {};
            const transactions = txRes.data.transactions || [];

            renderBalanceCards(balances);
            updatePaymentMethodDetails();
            renderTransactionsTable(transactions);
        } catch (err) {
            console.warn('API unavailable, utilizing fallback wallet state:', err);
            // High-fidelity fallback state for seamless offline & static preview
            officialAccounts = {
                zain_cash: { title: 'محفظة زين كاش المعتمدة (ZainCash العراق)', account: '07801234567' },
                asia_hawala: { title: 'حساب آسيا حوالة الرسمي (AsiaHawala)', account: '07701234567' },
                qi_card: { title: 'ماستر كارد الرافدين / مصرف الرشيد (Qi Card)', account: '9876543210123456' }
            };
            const fallbackBalances = {
                available_balance: 0,
                pending_balance: 0,
                total_withdrawn: 0,
                official_accounts: officialAccounts
            };
            renderBalanceCards(fallbackBalances);
            updatePaymentMethodDetails();
            renderTransactionsTable([]);
        }
    };

    /**
     * Render Wallet Metric Overview Cards
     */
    const renderBalanceCards = (data) => {
        const availEl = document.getElementById('wallet-available-balance');
        const pendingEl = document.getElementById('wallet-pending-balance');
        const withdrawnEl = document.getElementById('wallet-total-withdrawn');

        if (availEl) {
            availEl.innerHTML = `
                <span class="text-3xl font-extrabold text-emerald-400 font-mono">
                    ${Number(data.available_balance).toLocaleString('ar-IQ')}
                </span>
                <span class="currency-iqd text-emerald-500/80 mr-1.5 font-bold">د.ع</span>
            `;
        }

        if (pendingEl) {
            pendingEl.innerHTML = `
                <span class="text-2xl font-bold text-amber-400 font-mono">
                    ${Number(data.pending_balance).toLocaleString('ar-IQ')}
                </span>
                <span class="currency-iqd text-amber-500/80 mr-1 font-semibold">د.ع</span>
            `;
        }

        if (withdrawnEl) {
            withdrawnEl.innerHTML = `
                <span class="text-2xl font-bold text-slate-200 font-mono">
                    ${Number(data.total_withdrawn).toLocaleString('ar-IQ')}
                </span>
                <span class="currency-iqd text-slate-400 mr-1 font-semibold">د.ع</span>
            `;
        }
    };

    /**
     * Switch Action Tab (Deposit vs Withdraw)
     */
    const switchActionTab = (tabName) => {
        const depTabBtn = document.getElementById('wallet-tab-deposit-btn');
        const withTabBtn = document.getElementById('wallet-tab-withdraw-btn');
        const depView = document.getElementById('wallet-deposit-view');
        const withView = document.getElementById('wallet-withdraw-view');

        if (tabName === 'deposit') {
            depTabBtn.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
            depTabBtn.classList.remove('text-slate-400', 'border-transparent');
            withTabBtn.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
            withTabBtn.classList.add('text-slate-400', 'border-transparent');

            depView.classList.remove('hidden');
            withView.classList.add('hidden');
        } else {
            withTabBtn.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
            withTabBtn.classList.remove('text-slate-400', 'border-transparent');
            depTabBtn.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
            depTabBtn.classList.add('text-slate-400', 'border-transparent');

            withView.classList.remove('hidden');
            depView.classList.add('hidden');
        }
    };

    /**
     * Select Payment Method for Deposit
     */
    const selectMethod = (method) => {
        selectedPaymentMethod = method;

        const methods = ['zain_cash', 'asia_hawala', 'qi_card'];
        methods.forEach(m => {
            const btn = document.getElementById(`method-btn-${m}`);
            if (btn) {
                if (m === method) {
                    btn.classList.add('border-emerald-500', 'bg-emerald-500/15', 'text-emerald-300');
                    btn.classList.remove('border-slate-800', 'bg-slate-900/60', 'text-slate-400');
                } else {
                    btn.classList.remove('border-emerald-500', 'bg-emerald-500/15', 'text-emerald-300');
                    btn.classList.add('border-slate-800', 'bg-slate-900/60', 'text-slate-400');
                }
            }
        });

        updatePaymentMethodDetails();
    };

    /**
     * Update Official Destination Account Details
     */
    const updatePaymentMethodDetails = () => {
        const details = officialAccounts[selectedPaymentMethod];
        if (!details) return;

        const accNumEl = document.getElementById('official-account-number');
        const accNameEl = document.getElementById('official-account-name');

        if (accNumEl) accNumEl.textContent = details.account;
        if (accNameEl) accNameEl.textContent = details.title;
    };

    /**
     * Copy Official Account Number to Clipboard
     */
    const copyAccountNumber = () => {
        const details = officialAccounts[selectedPaymentMethod];
        if (!details) return;

        navigator.clipboard.writeText(details.account).then(() => {
            const copyBtn = document.getElementById('copy-account-btn');
            const originalText = copyBtn.innerHTML;

            copyBtn.innerHTML = `
                <svg class="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span class="text-emerald-400">تم النسخ</span>
            `;

            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);

            App.toast('تم نسخ رقم الحساب إلى الحافظة بنجاح.', 'success');
        }).catch(() => {
            App.toast('تعذر نسخ الرقم تلقائياً.', 'warning');
        });
    };

    /**
     * Fill Deposit Amount from Quick Chips
     */
    const setDepositAmount = (amount) => {
        const input = document.getElementById('deposit-amount-input');
        if (input) {
            input.value = amount;
            input.focus();
        }
    };

    /**
     * Handle Receipt File Selection & Preview
     */
    const handleReceiptChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Size check: max 5MB
        if (file.size > 5 * 1024 * 1024) {
            App.toast('حجم الصورة كبير جداً (أقصى حد 5 ميجابايت).', 'error');
            e.target.value = '';
            return;
        }

        selectedReceiptFile = file;
        const previewContainer = document.getElementById('receipt-preview-container');
        const previewImage = document.getElementById('receipt-preview-img');
        const filenameText = document.getElementById('receipt-file-name');

        const reader = new FileReader();
        reader.onload = (event) => {
            previewImage.src = event.target.result;
            filenameText.textContent = file.name;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    };

    /**
     * Submit Deposit Request
     */
    const handleDepositSubmit = async (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('deposit-amount-input');
        const refInput = document.getElementById('deposit-ref-input');
        const senderInput = document.getElementById('deposit-sender-input');
        const submitBtn = document.getElementById('deposit-submit-btn');

        const amount = Number(amountInput.value);
        const ref = refInput.value.trim();
        const sender = senderInput ? senderInput.value.trim() : '';

        if (!amount || amount < 5000) {
            App.toast('الحد الأدنى للإيداع هو 5,000 د.ع.', 'error');
            return;
        }

        if (ref.length < 4) {
            App.toast('يرجى إدخال رقم الإشعار أو الحوالة بشكل صحيح.', 'error');
            return;
        }

        if (!selectedReceiptFile) {
            App.toast('يرجى إرفاق صورة إشعار التحويل المالي.', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            جاري رفع الإشعار وتسجيل الطلب...
        `;

        try {
            const formData = new FormData();
            formData.append('payment_method', selectedPaymentMethod);
            formData.append('amount', amount);
            formData.append('tx_reference', ref);
            formData.append('sender_account', sender);
            formData.append('receipt', selectedReceiptFile);

            const res = await API.post('wallet/deposit', formData, true);
            App.toast(res.message, 'success');

            // Reset form
            amountInput.value = '';
            refInput.value = '';
            if (senderInput) senderInput.value = '';
            document.getElementById('receipt-file-input').value = '';
            document.getElementById('receipt-preview-container').classList.add('hidden');
            selectedReceiptFile = null;

            load(); // Reload ledger
        } catch (err) {
            App.toast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>تأكيد طلب الإيداع وإرسال الإشعار</span>`;
        }
    };

    /**
     * Submit Withdrawal Request
     */
    const handleWithdrawSubmit = async (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('withdraw-amount-input');
        const methodSelect = document.getElementById('withdraw-method-select');
        const receiverInput = document.getElementById('withdraw-account-input');
        const submitBtn = document.getElementById('withdraw-submit-btn');

        const amount = Number(amountInput.value);
        const method = methodSelect.value;
        const receiver = receiverInput.value.trim();

        if (!amount || amount < 5000) {
            App.toast('الحد الأدنى لسحب الأرباح هو 5,000 د.ع.', 'error');
            return;
        }

        if (receiver.length < 6) {
            App.toast('يرجى إدخال رقم المحفظة أو الحساب المصرفي المستلم بشكل صحيح.', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white inline-block ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            جاري تدقيق الرصيد وتقديم الطلب...
        `;

        try {
            const res = await API.post('wallet/withdraw', {
                amount: amount,
                payment_method: method,
                receiver_account: receiver
            });

            App.toast(res.message, 'success');

            amountInput.value = '';
            receiverInput.value = '';

            load(); // Refresh wallet and transactions
        } catch (err) {
            App.toast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>تقديم طلب السحب المالي</span>`;
        }
    };

    /**
     * Render Transactions History Table
     */
    const renderTransactionsTable = (transactions) => {
        const tbody = document.getElementById('transactions-table-body');
        if (!tbody) return;

        if (transactions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-10 text-center text-slate-500 text-sm">
                        لا توجد أي معاملات مسجلة في محفظتك حتى الآن.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = transactions.map((tx) => {
            let statusBadge = '';
            if (tx.status === 'approved') {
                statusBadge = `
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        ${tx.status_text}
                    </span>
                `;
            } else if (tx.status === 'pending') {
                statusBadge = `
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                        ${tx.status_text}
                    </span>
                `;
            } else {
                statusBadge = `
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                        ${tx.status_text}
                    </span>
                `;
            }

            const isCredit = ['deposit', 'task_reward'].includes(tx.type);
            const amountPrefix = isCredit ? '+' : '-';
            const amountColor = isCredit ? 'text-emerald-400' : 'text-rose-400';

            return `
                <tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition">
                    <td class="py-3 px-4 font-medium text-slate-200">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${isCredit ? 'bg-emerald-400' : 'bg-rose-400'}"></span>
                            <span>${tx.type_text}</span>
                        </div>
                        <span class="text-[11px] text-slate-500 block font-mono mt-0.5">${tx.formatted_date}</span>
                    </td>
                    <td class="py-3 px-4 text-slate-300 text-xs">
                        <span>${tx.payment_method}</span>
                        ${tx.tx_reference !== '—' ? `<span class="block text-[11px] text-slate-500 font-mono">رقم: ${tx.tx_reference}</span>` : ''}
                    </td>
                    <td class="py-3 px-4 font-mono font-bold ${amountColor} text-left" dir="ltr">
                        ${amountPrefix}${Number(tx.amount).toLocaleString('ar-IQ')} <span class="text-xs">IQD</span>
                    </td>
                    <td class="py-3 px-4 text-center">
                        ${statusBadge}
                    </td>
                </tr>
            `;
        }).join('');
    };

    return {
        load,
        switchActionTab,
        selectMethod,
        copyAccountNumber,
        setDepositAmount,
        handleReceiptChange,
        handleDepositSubmit,
        handleWithdrawSubmit
    };
})();

