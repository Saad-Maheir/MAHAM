/**
 * MAHAM FinTech Platform - API Communication & Security Layer
 * Manages CSRF Token injection, session expiration, and error dispatching
 */

const API = (() => {
    let csrfToken = null;

    /**
     * Determine optimal API base path
     */
    const getBaseUrl = () => {
        // Works seamlessly whether on localhost, subfolder, or Hostinger domain
        const origin = window.location.origin;
        const pathname = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
        return `${origin}${pathname}/api`;
    };

    /**
     * Retrieve and store current CSRF token from backend
     */
    const initCsrf = async () => {
        try {
            const res = await fetch(`${getBaseUrl()}/csrf-token`, { credentials: 'same-origin' });
            if (res.ok) {
                const data = await res.json();
                if (data.data && data.data.csrf_token) {
                    csrfToken = data.data.csrf_token;
                }
            }
        } catch (e) {
            console.warn('CSRF initialization deferred.');
        }
    };

    /**
     * Unified request handler
     */
    const request = async (endpoint, options = {}) => {
        const url = `${getBaseUrl()}/${endpoint.replace(/^\//, '')}`;
        const headers = options.headers || {};

        headers['Accept'] = 'application/json';
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const fetchOptions = {
            method: options.method || 'GET',
            headers: headers,
            credentials: 'same-origin'
        };

        if (options.body) {
            if (options.body instanceof FormData) {
                fetchOptions.body = options.body;
                // If CSRF is present, append to FormData as well
                if (csrfToken && !options.body.has('csrf_token')) {
                    options.body.append('csrf_token', csrfToken);
                }
            } else {
                headers['Content-Type'] = 'application/json';
                const payload = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
                if (csrfToken) {
                    payload.csrf_token = csrfToken;
                }
                fetchOptions.body = JSON.stringify(payload);
            }
        }

        try {
            const response = await fetch(url, fetchOptions);
            const data = await response.json().catch(() => ({
                success: false,
                message: 'تعذر تحليل استجابة الخادم.'
            }));

            // Refresh CSRF token if returned in response envelope
            if (data.csrf_token) {
                csrfToken = data.csrf_token;
            }

            // Handle Unauthorized Session Expiration
            if (response.status === 401) {
                App.setAuthState(null);
                App.showAuthModal();
                throw new Error(data.message || 'انتهت صلاحية جلسة العمل. يرجى تسجيل الدخول مجدداً.');
            }

            if (!response.ok || data.success === false) {
                const error = new Error(data.message || 'حدث خطأ أثناء معالجة الطلب.');
                error.data = data;
                error.status = response.status;
                throw error;
            }

            return data;
        } catch (err) {
            throw err;
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
        setCsrfToken: (token) => { csrfToken = token; }
    };
})();

