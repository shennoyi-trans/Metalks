/**
 * Metalks 认证页面逻辑
 * API 调用全部通过 api/auth 模块
 */

import * as authApi from '../api/auth.js';
import { showToast as globalToast } from '../utils.js';

document.addEventListener('DOMContentLoaded', function () {
    console.log('Metalks Auth initialized');

    // ==================== 状态 ====================
    const state = {
        currentMode: 'login',
        currentType: 'password',
        currentRegisterType: 'email',
        emailCodeTimer: null,
        phoneCodeTimer: null,
        emailCodeCountdown: 60,
        phoneCodeCountdown: 60,
        isSendingEmailCode: false,
        isSendingPhoneCode: false,
        isLoggedIn: false,
    };

    // ==================== DOM 缓存 ====================
    const elements = {
        modeTabs: document.querySelectorAll('.mode-tab'),
        typeTabs: document.querySelectorAll('.type-tab'),
        registerTypeTabs: document.querySelectorAll('.register-type-tab'),

        forms: {
            passwordLogin: document.getElementById('passwordLoginForm'),
            codeLogin: document.getElementById('codeLoginForm'),
            emailRegister: document.getElementById('emailRegisterForm'),
            phoneRegister: document.getElementById('phoneRegisterForm'),
        },

        loginTypeTabsContainer: document.querySelector('.login-type-tabs'),
        registerTypeTabsContainer: document.getElementById('registerTypeTabs'),

        passwordLoginEmail: document.getElementById('passwordLoginEmail'),
        password: document.getElementById('password'),
        codeLoginEmail: document.getElementById('codeLoginEmail'),
        verificationCode: document.getElementById('verificationCode'),
        emailRegisterEmail: document.getElementById('emailRegisterEmail'),
        emailRegisterNickname: document.getElementById('emailRegisterNickname'),
        emailRegisterPassword: document.getElementById('emailRegisterPassword'),
        emailConfirmPassword: document.getElementById('emailConfirmPassword'),
        phoneRegisterPhone: document.getElementById('phoneRegisterPhone'),
        phoneRegisterNickname: document.getElementById('phoneRegisterNickname'),
        phoneVerificationCode: document.getElementById('phoneVerificationCode'),

        togglePassword: document.getElementById('togglePassword'),
        toggleEmailRegisterPassword: document.getElementById('toggleEmailRegisterPassword'),
        toggleEmailConfirmPassword: document.getElementById('toggleEmailConfirmPassword'),
        sendCodeBtn: document.getElementById('sendCodeBtn'),
        sendPhoneCodeBtn: document.getElementById('sendPhoneCodeBtn'),
        passwordLoginBtn: document.getElementById('passwordLoginBtn'),
        codeLoginBtn: document.getElementById('codeLoginBtn'),
        emailRegisterBtn: document.getElementById('emailRegisterBtn'),
        phoneRegisterBtn: document.getElementById('phoneRegisterBtn'),

        rememberMe: document.getElementById('rememberMe'),
        emailAgreeTerms: document.getElementById('emailAgreeTerms'),
        phoneAgreeTerms: document.getElementById('phoneAgreeTerms'),

        switchLinks: document.querySelectorAll('.switch-link'),
        forgotPassword: document.querySelector('.forgot-password'),

        loginFooterText: document.getElementById('loginFooterText'),
        registerFooterText: document.getElementById('registerFooterText'),

        toastContainer: document.getElementById('toastContainer'),
    };

    // ==================== 初始化 ====================
    init();

    async function init() {
        await checkLoginStatus();
        initEventListeners();
        loadRememberedAccount();
        updateFormDisplay();
    }

    async function checkLoginStatus() {
        try {
            const loggedIn = await authApi.checkAuth();
            if (loggedIn) {
                state.isLoggedIn = true;
                setTimeout(() => {
                    window.location.href = '/';
                }, 100);
            }
        } catch (_) {
            // 未登录，正常显示
        }
    }

    // ==================== 事件监听 ====================
    function initEventListeners() {
        elements.modeTabs.forEach((tab) => {
            tab.addEventListener('click', () => switchMode(tab.dataset.mode));
        });

        elements.typeTabs.forEach((tab) => {
            tab.addEventListener('click', () => switchType(tab.dataset.type));
        });

        elements.registerTypeTabs.forEach((tab) => {
            tab.addEventListener('click', () => switchRegisterType(tab.dataset.registerType));
        });

        elements.togglePassword?.addEventListener('click', () => {
            togglePasswordVisibility(elements.password, elements.togglePassword);
        });
        elements.toggleEmailRegisterPassword?.addEventListener('click', () => {
            togglePasswordVisibility(elements.emailRegisterPassword, elements.toggleEmailRegisterPassword);
        });
        elements.toggleEmailConfirmPassword?.addEventListener('click', () => {
            togglePasswordVisibility(elements.emailConfirmPassword, elements.toggleEmailConfirmPassword);
        });

        elements.sendCodeBtn?.addEventListener('click', sendEmailVerificationCode);
        elements.sendPhoneCodeBtn?.addEventListener('click', sendPhoneVerificationCode);

        elements.verificationCode?.addEventListener('input', (e) => {
            if (e.target.value.length === 6) {
                setTimeout(() => handleCodeLogin(), 300);
            }
        });
        elements.phoneVerificationCode?.addEventListener('input', (e) => {
            if (e.target.value.length === 6) {
                setTimeout(() => handlePhoneRegister(), 300);
            }
        });

        elements.forms.passwordLogin?.addEventListener('submit', (e) => {
            e.preventDefault();
            handlePasswordLogin();
        });
        elements.forms.codeLogin?.addEventListener('submit', (e) => {
            e.preventDefault();
            handleCodeLogin();
        });
        elements.forms.emailRegister?.addEventListener('submit', (e) => {
            e.preventDefault();
            handleEmailRegister();
        });
        elements.forms.phoneRegister?.addEventListener('submit', (e) => {
            e.preventDefault();
            handlePhoneRegister();
        });

        elements.switchLinks.forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                switchMode(link.dataset.mode);
            });
        });

        elements.forgotPassword?.addEventListener('click', (e) => {
            e.preventDefault();
            switchMode('login');
            switchType('code');
            showToast('请使用验证码登录', 'info');
        });

        // 实时验证
        [elements.codeLoginEmail, elements.passwordLoginEmail, elements.emailRegisterEmail]
            .filter(Boolean)
            .forEach((input) => {
                input.addEventListener('input', validateEmailInput);
            });

        elements.phoneRegisterPhone?.addEventListener('input', validatePhoneInput);
        elements.emailConfirmPassword?.addEventListener('input', validatePasswordMatch);
    }

    // ==================== 登录 / 注册处理 ====================
    async function handlePasswordLogin() {
        const email = elements.passwordLoginEmail?.value.trim() || '';
        const password = elements.password?.value.trim() || '';
        const rememberMe = elements.rememberMe?.checked || false;

        if (!email || !password) {
            showToast('请填写邮箱和密码', 'error');
            return;
        }
        if (!validateEmail(email)) {
            showToast('请输入有效的邮箱地址', 'error');
            elements.passwordLoginEmail?.classList.add('error');
            return;
        }

        setLoading(elements.passwordLoginBtn, true);

        try {
            const result = await authApi.login(email, password);

            if (result.success) {
                showToast('登录成功，正在跳转...', 'success');

                if (rememberMe) {
                    localStorage.setItem('remembered_account', email);
                } else {
                    localStorage.removeItem('remembered_account');
                }

                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
            } else {
                throw new Error(result.error || '登录失败');
            }
        } catch (error) {
            console.error('登录失败:', error);
            showToast(error.message, 'error');
            elements.password?.classList.add('error');
        } finally {
            setLoading(elements.passwordLoginBtn, false);
        }
    }

    async function handleCodeLogin() {
        showToast('验证码登录功能暂未开放，请使用密码登录', 'info');
    }

    async function handleEmailRegister() {
        const email = elements.emailRegisterEmail?.value.trim() || '';
        const nickname = elements.emailRegisterNickname?.value.trim() || '';
        const password = elements.emailRegisterPassword?.value || '';
        const confirm = elements.emailConfirmPassword?.value || '';
        const agreeTerms = elements.emailAgreeTerms?.checked || false;

        if (!email || !password || !confirm) {
            showToast('请填写所有必填项', 'error');
            return;
        }
        if (!validateEmail(email)) {
            showToast('请输入有效的邮箱地址', 'error');
            elements.emailRegisterEmail?.classList.add('error');
            return;
        }
        if (password.length < 8) {
            showToast('密码至少需要8位', 'error');
            elements.emailRegisterPassword?.classList.add('error');
            return;
        }
        if (password !== confirm) {
            showToast('两次输入的密码不一致', 'error');
            elements.emailConfirmPassword?.classList.add('error');
            return;
        }
        if (!agreeTerms) {
            showToast('请同意用户协议和隐私政策', 'error');
            return;
        }

        setLoading(elements.emailRegisterBtn, true);

        try {
            const result = await authApi.register(email, password, nickname);

            if (result.success) {
                showToast('注册成功，请登录', 'success');

                setTimeout(() => {
                    switchMode('login');
                    switchType('password');
                    if (elements.passwordLoginEmail) {
                        elements.passwordLoginEmail.value = email;
                    }
                }, 1500);
            } else {
                throw new Error(result.error || '注册失败');
            }
        } catch (error) {
            console.error('注册失败:', error);
            showToast(error.message, 'error');
        } finally {
            setLoading(elements.emailRegisterBtn, false);
        }
    }

    async function handlePhoneRegister() {
        const phone = elements.phoneRegisterPhone?.value.trim() || '';
        const nickname = elements.phoneRegisterNickname?.value.trim() || '';
        const code = elements.phoneVerificationCode?.value.trim() || '';
        const agreeTerms = elements.phoneAgreeTerms?.checked || false;

        if (!phone || !code) {
            showToast('请填写手机号和验证码', 'error');
            return;
        }
        if (!validatePhone(phone)) {
            showToast('请输入有效的手机号', 'error');
            elements.phoneRegisterPhone?.classList.add('error');
            return;
        }
        if (code.length !== 6 || !/^\d+$/.test(code)) {
            showToast('请输入6位数字验证码', 'error');
            elements.phoneVerificationCode?.classList.add('error');
            return;
        }
        if (!agreeTerms) {
            showToast('请同意用户协议和隐私政策', 'error');
            return;
        }

        setLoading(elements.phoneRegisterBtn, true);

        try {
            showToast('手机号注册功能暂未开放，请使用邮箱注册', 'info');
        } catch (error) {
            console.error('注册失败:', error);
            showToast(error.message, 'error');
        } finally {
            setLoading(elements.phoneRegisterBtn, false);
        }
    }

    // ==================== 验证码 ====================
    async function sendEmailVerificationCode() {
        const email = elements.codeLoginEmail?.value.trim() || '';
        if (!validateEmail(email)) {
            showToast('请输入有效的邮箱地址', 'error');
            return;
        }
        showToast('验证码功能暂未开放', 'info');
    }

    async function sendPhoneVerificationCode() {
        const phone = elements.phoneRegisterPhone?.value.trim() || '';
        if (!validatePhone(phone)) {
            showToast('请输入有效的手机号', 'error');
            return;
        }
        showToast('手机号验证码功能暂未开放', 'info');
    }

    // ==================== UI 辅助 ====================
    function switchMode(mode) {
        if (mode !== state.currentMode) {
            state.currentMode = mode;
            if (mode === 'register') {
                state.currentRegisterType = 'email';
            }
        }

        elements.modeTabs.forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });

        updateFormDisplay();
        updateFooterText();
        resetForms();
    }

    function switchType(type) {
        state.currentType = type;
        elements.typeTabs.forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.type === type);
        });
        updateFormDisplay();
    }

    function switchRegisterType(type) {
        state.currentRegisterType = type;
        elements.registerTypeTabs.forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.registerType === type);
        });
        updateFormDisplay();
    }

    function updateFormDisplay() {
        // Tab containers
        if (state.currentMode === 'login') {
            if (elements.loginTypeTabsContainer) elements.loginTypeTabsContainer.style.display = 'flex';
            if (elements.registerTypeTabsContainer) elements.registerTypeTabsContainer.style.display = 'none';
        } else {
            if (elements.loginTypeTabsContainer) elements.loginTypeTabsContainer.style.display = 'none';
            if (elements.registerTypeTabsContainer) elements.registerTypeTabsContainer.style.display = 'flex';
        }

        Object.values(elements.forms).forEach((form) => {
            if (form) form.classList.remove('active');
        });

        if (state.currentMode === 'login') {
            if (state.currentType === 'password') {
                elements.forms.passwordLogin?.classList.add('active');
            } else {
                elements.forms.codeLogin?.classList.add('active');
            }
        } else if (state.currentMode === 'register') {
            if (state.currentRegisterType === 'email') {
                elements.forms.emailRegister?.classList.add('active');
            } else {
                elements.forms.phoneRegister?.classList.add('active');
            }
        }
    }

    function updateFooterText() {
        if (state.currentMode === 'login') {
            if (elements.loginFooterText) elements.loginFooterText.style.display = 'block';
            if (elements.registerFooterText) elements.registerFooterText.style.display = 'none';
        } else {
            if (elements.loginFooterText) elements.loginFooterText.style.display = 'none';
            if (elements.registerFooterText) elements.registerFooterText.style.display = 'block';
        }
    }

    function resetForms() {
        document.querySelectorAll('input').forEach((input) => {
            input.classList.remove('error', 'success');
        });
    }

    function togglePasswordVisibility(passwordInput, toggleButton) {
        if (!passwordInput || !toggleButton) return;
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        const icon = type === 'password' ? 'ri-eye-line' : 'ri-eye-off-line';
        passwordInput.type = type;
        toggleButton.innerHTML = `<i class="${icon}"></i>`;
        toggleButton.style.color = type === 'password' ? 'var(--text-secondary)' : 'var(--accent-primary)';
    }

    function setLoading(button, isLoading) {
        if (!button) return;
        button.disabled = isLoading;
        button.classList.toggle('loading', isLoading);
    }

    function loadRememberedAccount() {
        const remembered = localStorage.getItem('remembered_account');
        if (remembered && elements.passwordLoginEmail) {
            elements.passwordLoginEmail.value = remembered;
            if (elements.rememberMe) elements.rememberMe.checked = true;
        }
    }

    // ==================== 验证函数 ====================
    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validatePhone(phone) {
        return /^1[3-9]\d{9}$/.test(phone);
    }

    function validateEmailInput(e) {
        const val = e.target.value.trim();
        if (val && !validateEmail(val)) {
            e.target.classList.add('error');
            e.target.classList.remove('success');
        } else if (val) {
            e.target.classList.remove('error');
            e.target.classList.add('success');
        } else {
            e.target.classList.remove('error', 'success');
        }
    }

    function validatePhoneInput(e) {
        const val = e.target.value.trim();
        if (val && !validatePhone(val)) {
            e.target.classList.add('error');
            e.target.classList.remove('success');
        } else if (val) {
            e.target.classList.remove('error');
            e.target.classList.add('success');
        } else {
            e.target.classList.remove('error', 'success');
        }
    }

    function validatePasswordMatch() {
        const pw = elements.emailRegisterPassword?.value || '';
        const confirm = elements.emailConfirmPassword?.value || '';
        if (confirm && pw !== confirm) {
            elements.emailConfirmPassword.classList.add('error');
        } else if (confirm) {
            elements.emailConfirmPassword.classList.remove('error');
            elements.emailConfirmPassword.classList.add('success');
        }
    }

    // ==================== Toast（auth 页面有自己的 Toast 系统） ====================
    function showToast(message, type = 'info') {
        const container = elements.toastContainer;
        if (!container) return;

        const toastId = 'toast-' + Date.now();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.id = toastId;

        const icons = {
            success: 'ri-checkbox-circle-fill',
            error: 'ri-error-warning-fill',
            warning: 'ri-alert-fill',
            info: 'ri-information-fill',
        };

        toast.innerHTML = `
            <i class="${icons[type] || icons.info}"></i>
            <div class="toast-content">${message}</div>
            <button class="toast-close" onclick="window.__removeToast('${toastId}')">
                <i class="ri-close-line"></i>
            </button>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            window.__removeToast(toastId);
        }, 5000);
    }

    // 全局挂载 removeToast（auth 页面独有的 toast 移除）
    window.__removeToast = function (toastId) {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }
    };

    console.log('✅ Auth 系统初始化完成');
});
