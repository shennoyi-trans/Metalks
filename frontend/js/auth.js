// Metalks 认证页面主逻辑 - 修改版
document.addEventListener('DOMContentLoaded', function() {
    console.log('Metalks Auth initialized');
    
    // 检查utils是否已加载
    if (!window.MetalksUtils) {
        console.error('❌ MetalksUtils not loaded!');
        showToast('系统初始化失败，请刷新页面', 'error');
        return;
    }
    
    // 使用utils别名
    const utils = window.MetalksUtils;
    
    // 状态管理
    const state = {
        currentMode: 'login',
        currentType: 'password',
        currentRegisterType: 'email', // 新增：注册类型
        emailCodeTimer: null,
        phoneCodeTimer: null,
        emailCodeCountdown: 60,
        phoneCodeCountdown: 60,
        isSendingEmailCode: false,
        isSendingPhoneCode: false,
        isLoggedIn: false
    };
    
    // DOM元素缓存
    const elements = {
        // 标签页
        modeTabs: document.querySelectorAll('.mode-tab'),
        typeTabs: document.querySelectorAll('.type-tab'),
        registerTypeTabs: document.querySelectorAll('.register-type-tab'),
        
        // 表单容器
        forms: {
            passwordLogin: document.getElementById('passwordLoginForm'),
            codeLogin: document.getElementById('codeLoginForm'),
            emailRegister: document.getElementById('emailRegisterForm'),
            phoneRegister: document.getElementById('phoneRegisterForm')
        },
        
        // 注册类型选择容器
        registerTypeTabsContainer: document.getElementById('registerTypeTabs'),
        
        // 输入字段
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
        
        // 按钮
        togglePassword: document.getElementById('togglePassword'),
        toggleEmailRegisterPassword: document.getElementById('toggleEmailRegisterPassword'),
        toggleEmailConfirmPassword: document.getElementById('toggleEmailConfirmPassword'),
        sendCodeBtn: document.getElementById('sendCodeBtn'),
        sendPhoneCodeBtn: document.getElementById('sendPhoneCodeBtn'),
        passwordLoginBtn: document.getElementById('passwordLoginBtn'),
        codeLoginBtn: document.getElementById('codeLoginBtn'),
        emailRegisterBtn: document.getElementById('emailRegisterBtn'),
        phoneRegisterBtn: document.getElementById('phoneRegisterBtn'),
        
        // 选项
        rememberMe: document.getElementById('rememberMe'),
        emailAgreeTerms: document.getElementById('emailAgreeTerms'),
        phoneAgreeTerms: document.getElementById('phoneAgreeTerms'),
        
        // 链接
        switchLinks: document.querySelectorAll('.switch-link'),
        forgotPassword: document.querySelector('.forgot-password'),
        
        // 底部文本
        loginFooterText: document.getElementById('loginFooterText'),
        registerFooterText: document.getElementById('registerFooterText'),
        
        // Toast容器
        toastContainer: document.getElementById('toastContainer')
    };
    
    // 初始化
    init();
    
    function init() {
        // 检查是否已登录
        checkLoginStatus();
        initEventListeners();
        loadRememberedAccount();
    }
    
    async function checkLoginStatus() {
        try {
            const loggedIn = await utils.checkAuth();
            if (loggedIn) {
                state.isLoggedIn = true;
                window.location.href = '/';
            }
        } catch (e) {
            // 未登录，留在认证页面
        }
    }
    
    function initEventListeners() {
        // 模式切换（登录/注册）
        elements.modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchMode(tab.dataset.mode);
            });
        });
        
        // 登录方式切换（密码/验证码）
        elements.typeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchType(tab.dataset.type);
            });
        });
        
        // 注册方式切换（邮箱/手机号）
        elements.registerTypeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchRegisterType(tab.dataset.registerType);
            });
        });
        
        // 切换密码可见性
        elements.togglePassword?.addEventListener('click', () => {
            togglePasswordVisibility(elements.password, elements.togglePassword);
        });
        
        elements.toggleEmailRegisterPassword?.addEventListener('click', () => {
            togglePasswordVisibility(elements.emailRegisterPassword, elements.toggleEmailRegisterPassword);
        });
        
        elements.toggleEmailConfirmPassword?.addEventListener('click', () => {
            togglePasswordVisibility(elements.emailConfirmPassword, elements.toggleEmailConfirmPassword);
        });
        
        // 发送验证码（登录）
        elements.sendCodeBtn?.addEventListener('click', sendEmailVerificationCode);
        
        // 发送验证码（手机注册）
        elements.sendPhoneCodeBtn?.addEventListener('click', sendPhoneVerificationCode);
        
        // 验证码输入时自动跳转
        elements.verificationCode?.addEventListener('input', (e) => {
            if (e.target.value.length === 6) {
                // 自动触发登录
                setTimeout(() => {
                    handleCodeLogin();
                }, 300);
            }
        });
        
        elements.phoneVerificationCode?.addEventListener('input', (e) => {
            if (e.target.value.length === 6) {
                // 自动触发注册
                setTimeout(() => {
                    handlePhoneRegister();
                }, 300);
            }
        });
        
        // 表单提交
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
        
        // 底部链接切换
        elements.switchLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                switchMode(link.dataset.mode);
            });
        });
        
        // 忘记密码
        elements.forgotPassword?.addEventListener('click', (e) => {
            e.preventDefault();
            // 切换到验证码登录模式
            switchMode('login');
            switchType('code');
            showToast('请使用验证码登录', 'info');
        });
        
        // 实时验证邮箱格式
        const emailInputs = [
            elements.codeLoginEmail,
            elements.passwordLoginEmail,
            elements.emailRegisterEmail
        ].filter(Boolean);
        
        emailInputs.forEach(input => {
            input?.addEventListener('input', validateEmailInput);
        });
        
        // 实时验证手机号格式
        elements.phoneRegisterPhone?.addEventListener('input', validatePhoneInput);
        
        // 注册密码匹配验证
        elements.emailConfirmPassword?.addEventListener('input', validatePasswordMatch);
    }
    
    function switchMode(mode) {
        if (mode !== state.currentMode) {
            state.currentMode = mode;
            updateModeTabs();
            updateFormDisplay();
            updateFooterText();
            
            // 重置表单
            resetForms();
        }
    }
    
    function switchType(type) {
        if (type !== state.currentType) {
            state.currentType = type;
            updateTypeTabs();
            updateFormDisplay();
        }
    }
    
    function switchRegisterType(registerType) {
        if (registerType !== state.currentRegisterType) {
            state.currentRegisterType = registerType;
            updateRegisterTypeTabs();
            updateFormDisplay();
        }
    }
    
    function updateModeTabs() {
        elements.modeTabs.forEach(tab => {
            const isActive = tab.dataset.mode === state.currentMode;
            tab.classList.toggle('active', isActive);
        });
    }
    
    function updateTypeTabs() {
        elements.typeTabs.forEach(tab => {
            const isActive = tab.dataset.type === state.currentType;
            tab.classList.toggle('active', isActive);
        });
    }
    
    function updateRegisterTypeTabs() {
        elements.registerTypeTabs.forEach(tab => {
            const isActive = tab.dataset.registerType === state.currentRegisterType;
            tab.classList.toggle('active', isActive);
        });
    }
    
    function updateFormDisplay() {
        // 显示/隐藏注册方式选择
        if (state.currentMode === 'register') {
            elements.registerTypeTabsContainer.style.display = 'flex';
        } else {
            elements.registerTypeTabsContainer.style.display = 'none';
        }
        
        // 隐藏所有表单
        Object.values(elements.forms).forEach(form => {
            if (form) form.classList.remove('active');
        });
        
        // 显示当前表单
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
            if (elements.loginFooterText) {
                elements.loginFooterText.style.display = 'block';
            }
            if (elements.registerFooterText) {
                elements.registerFooterText.style.display = 'none';
            }
        } else {
            if (elements.loginFooterText) {
                elements.loginFooterText.style.display = 'none';
            }
            if (elements.registerFooterText) {
                elements.registerFooterText.style.display = 'block';
            }
        }
    }
    
    function resetForms() {
        // 清除所有输入框的验证状态
        document.querySelectorAll('input').forEach(input => {
            input.classList.remove('error', 'success');
        });
    }
    
    function togglePasswordVisibility(passwordInput, toggleButton) {
        if (!passwordInput || !toggleButton) return;
        
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        const icon = type === 'password' ? 'ri-eye-line' : 'ri-eye-off-line';
        
        passwordInput.type = type;
        toggleButton.innerHTML = `<i class="${icon}"></i>`;
        
        // 添加视觉反馈
        toggleButton.style.color = type === 'password' ? 'var(--text-secondary)' : 'var(--accent-primary)';
    }
    
    // 验证函数
    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    function validatePhone(phone) {
        const phoneRegex = /^1[3-9]\d{9}$/;
        return phoneRegex.test(phone);
    }
    
    function validateEmailInput(e) {
        const input = e.target;
        const value = input.value.trim();
        
        if (!value) {
            input.classList.remove('error', 'success');
            return false;
        }
        
        const isValid = validateEmail(value);
        
        if (isValid) {
            input.classList.remove('error');
            input.classList.add('success');
        } else {
            input.classList.remove('success');
            input.classList.add('error');
        }
        
        return isValid;
    }
    
    function validatePhoneInput(e) {
        const input = e.target;
        const value = input.value.trim();
        
        if (!value) {
            input.classList.remove('error', 'success');
            return false;
        }
        
        const isValid = validatePhone(value);
        
        if (isValid) {
            input.classList.remove('error');
            input.classList.add('success');
        } else {
            input.classList.remove('success');
            input.classList.add('error');
        }
        
        return isValid;
    }
    
    function validatePasswordMatch() {
        const password = elements.emailRegisterPassword?.value || '';
        const confirm = elements.emailConfirmPassword?.value || '';
        
        if (!confirm || !elements.emailConfirmPassword) return true;
        
        const isValid = password === confirm;
        
        if (isValid) {
            elements.emailConfirmPassword.classList.remove('error');
            elements.emailConfirmPassword.classList.add('success');
        } else {
            elements.emailConfirmPassword.classList.remove('success');
            elements.emailConfirmPassword.classList.add('error');
        }
        
        return isValid;
    }
    
    // 验证码功能 - 暂时禁用，需要后端支持
    async function sendEmailVerificationCode() {
        showToast('验证码功能暂未开放，请使用密码登录', 'info');
        return;
    }
    
    async function sendPhoneVerificationCode() {
        const phone = elements.phoneRegisterPhone?.value.trim() || '';
        
        if (!validatePhone(phone)) {
            showToast('请输入有效的手机号', 'error');
            if (elements.phoneRegisterPhone) elements.phoneRegisterPhone.classList.add('error');
            return;
        }
        
        // 检查手机号是否已注册
        try {
            showToast('手机号验证中...', 'info');
            
            // 这里应该调用后端检查手机号是否已注册的接口
            // 由于文档中未提供相关接口，暂时模拟
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            showToast('手机号可用，验证码功能暂未开放', 'info');
            
        } catch (error) {
            console.error('检查手机号失败:', error);
            showToast('验证失败，请稍后重试', 'error');
        }
    }
    
    function startCodeCountdown(type = 'email') {
        const timerElement = type === 'email' ? document.getElementById('codeTimer') : document.getElementById('phoneCodeTimer');
        const countdownVar = type === 'email' ? 'emailCodeCountdown' : 'phoneCodeCountdown';
        const timerVar = type === 'email' ? 'emailCodeTimer' : 'phoneCodeTimer';
        const sendingVar = type === 'email' ? 'isSendingEmailCode' : 'isSendingPhoneCode';
        const sendBtn = type === 'email' ? elements.sendCodeBtn : elements.sendPhoneCodeBtn;
        
        if (!timerElement) return;
        
        state[countdownVar] = 60;
        
        if (state[timerVar]) clearInterval(state[timerVar]);
        
        state[timerVar] = setInterval(() => {
            state[countdownVar]--;
            timerElement.textContent = `${state[countdownVar]}秒后重试`;
            timerElement.classList.add('countdown');
            
            if (state[countdownVar] <= 0) {
                clearInterval(state[timerVar]);
                timerElement.textContent = '获取验证码';
                timerElement.classList.remove('countdown');
                if (sendBtn) sendBtn.disabled = false;
                state[sendingVar] = false;
            }
        }, 1000);
    }
    
    // 登录功能
    async function handlePasswordLogin() {
        const email = elements.passwordLoginEmail?.value.trim() || '';
        const password = elements.password?.value || '';
        const rememberMe = elements.rememberMe?.checked || false;
        
        // 前端验证
        if (!email || !password) {
            showToast('请填写邮箱和密码', 'error');
            return;
        }
        
        if (!validateEmail(email)) {
            showToast('请输入有效的邮箱地址', 'error');
            if (elements.passwordLoginEmail) elements.passwordLoginEmail.classList.add('error');
            return;
        }
        
        setLoading(elements.passwordLoginBtn, true);
        
        try {
            const result = await utils.login(email, password);
            
            if (result.success) {
                // 登录成功
                showToast('登录成功，正在跳转...', 'success');
                
                // 保存记住的账号
                if (rememberMe) {
                    localStorage.setItem('remembered_account', email);
                } else {
                    localStorage.removeItem('remembered_account');
                }
                
                // 延迟跳转，让用户看到成功消息
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
                
            } else {
                throw new Error(result.error || '登录失败');
            }
            
        } catch (error) {
            console.error('登录失败:', error);
            showToast(error.message, 'error');
            
            // 标记密码输入框为错误
            if (elements.password) elements.password.classList.add('error');
            
        } finally {
            setLoading(elements.passwordLoginBtn, false);
        }
    }
    
    async function handleCodeLogin() {
        // 暂时禁用验证码登录
        showToast('验证码登录功能暂未开放，请使用密码登录', 'info');
        return;
    }
    
    // 邮箱注册功能
    async function handleEmailRegister() {
        const email = elements.emailRegisterEmail?.value.trim() || '';
        const nickname = elements.emailRegisterNickname?.value.trim() || '';
        const password = elements.emailRegisterPassword?.value || '';
        const confirm = elements.emailConfirmPassword?.value || '';
        const agreeTerms = elements.emailAgreeTerms?.checked || false;
        
        // 前端验证
        if (!email || !password || !confirm) {
            showToast('请填写所有必填项', 'error');
            return;
        }
        
        if (!validateEmail(email)) {
            showToast('请输入有效的邮箱地址', 'error');
            if (elements.emailRegisterEmail) elements.emailRegisterEmail.classList.add('error');
            return;
        }
        
        if (password.length < 6) {
            showToast('密码至少需要6位', 'error');
            if (elements.emailRegisterPassword) elements.emailRegisterPassword.classList.add('error');
            return;
        }
        
        if (password !== confirm) {
            showToast('两次输入的密码不一致', 'error');
            if (elements.emailConfirmPassword) elements.emailConfirmPassword.classList.add('error');
            return;
        }
        
        if (!agreeTerms) {
            showToast('请同意用户协议和隐私政策', 'error');
            return;
        }
        
        setLoading(elements.emailRegisterBtn, true);
        
        try {
            // 检查邮箱是否可用
            const checkResponse = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`, {
                credentials: 'include'
            });
            
            const checkData = await checkResponse.json();
            
            if (!checkData.available) {
                throw new Error('邮箱已被注册');
            }
            
            const result = await utils.register(email, password, nickname);
            
            if (result.success) {
                // 注册成功
                showToast('注册成功，请登录', 'success');
                
                // 切换到登录模式
                setTimeout(() => {
                    switchMode('login');
                    switchType('password');
                    
                    // 填充邮箱到登录表单
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
    
    // 手机号注册功能
    async function handlePhoneRegister() {
        const phone = elements.phoneRegisterPhone?.value.trim() || '';
        const nickname = elements.phoneRegisterNickname?.value.trim() || '';
        const code = elements.phoneVerificationCode?.value.trim() || '';
        const agreeTerms = elements.phoneAgreeTerms?.checked || false;
        
        // 前端验证
        if (!phone || !code) {
            showToast('请填写手机号和验证码', 'error');
            return;
        }
        
        if (!validatePhone(phone)) {
            showToast('请输入有效的手机号', 'error');
            if (elements.phoneRegisterPhone) elements.phoneRegisterPhone.classList.add('error');
            return;
        }
        
        if (code.length !== 6 || !/^\d+$/.test(code)) {
            showToast('请输入6位数字验证码', 'error');
            if (elements.phoneVerificationCode) elements.phoneVerificationCode.classList.add('error');
            return;
        }
        
        if (!agreeTerms) {
            showToast('请同意用户协议和隐私政策', 'error');
            return;
        }
        
        setLoading(elements.phoneRegisterBtn, true);
        
        try {
            // 注意：后端文档中未提供手机号注册接口
            // 这里需要根据实际情况调整
            showToast('手机号注册功能暂未开放，请使用邮箱注册', 'info');
            
        } catch (error) {
            console.error('注册失败:', error);
            showToast(error.message, 'error');
            
        } finally {
            setLoading(elements.phoneRegisterBtn, false);
        }
    }
    
    // 工具函数
    function setLoading(button, isLoading) {
        if (!button) return;
        
        if (isLoading) {
            button.disabled = true;
            button.classList.add('loading');
        } else {
            button.disabled = false;
            button.classList.remove('loading');
        }
    }
    
    function loadRememberedAccount() {
        const rememberedAccount = localStorage.getItem('remembered_account');
        if (rememberedAccount && elements.passwordLoginEmail) {
            elements.passwordLoginEmail.value = rememberedAccount;
            if (elements.rememberMe) {
                elements.rememberMe.checked = true;
            }
        }
    }
    
    // Toast提示系统
    function showToast(message, type = 'info') {
        const toastContainer = elements.toastContainer;
        if (!toastContainer) return;
        
        const toastId = 'toast-' + Date.now();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.id = toastId;
        
        const icons = {
            success: 'ri-checkbox-circle-fill',
            error: 'ri-error-warning-fill',
            warning: 'ri-alert-fill',
            info: 'ri-information-fill'
        };
        
        toast.innerHTML = `
            <i class="${icons[type] || icons.info}"></i>
            <div class="toast-content">${message}</div>
            <button class="toast-close" onclick="removeToast('${toastId}')">
                <i class="ri-close-line"></i>
            </button>
        `;
        
        toastContainer.appendChild(toast);
        
        // 5秒后自动移除
        setTimeout(() => {
            removeToast(toastId);
        }, 5000);
    }
    
    // 全局函数
    window.removeToast = function(toastId) {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }
    };
    
    // 初始化提示
    console.log('✅ Auth系统初始化完成');
});