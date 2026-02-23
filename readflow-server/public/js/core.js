// --- Global Config ---
const API_BASE = '/api/admin';

// --- Auth Logic ---
const originalFetch = window.fetch;
window.fetch = async (url, options = {}) => {
    if (typeof url === 'string' && url.startsWith(API_BASE) && !url.includes('/login')) {
        options.headers = {
            ...options.headers,
            'X-Admin-Token': localStorage.getItem('adminToken') || ''
        };
    }

    const res = await originalFetch(url, options);
    if (res.status === 401 && url.startsWith(API_BASE) && !url.includes('/login')) {
        showLogin();
    }
    return res;
};

function setLoginError(message) {
    const errorEl = document.getElementById('login-error');
    const input = document.getElementById('login-password');
    if (input) {
        input.setAttribute('data-invalid', 'true');
        input.setAttribute('aria-invalid', 'true');
    }
    if (errorEl) {
        errorEl.textContent = message || '登录失败';
        errorEl.classList.remove('hidden');
    }
}

function clearLoginError() {
    const errorEl = document.getElementById('login-error');
    const input = document.getElementById('login-password');
    if (input) {
        input.removeAttribute('data-invalid');
        input.setAttribute('aria-invalid', 'false');
    }
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function showLogin() {
    const overlay = document.getElementById('login-overlay');
    const input = document.getElementById('login-password');
    if (overlay) overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    clearLoginError();
    if (input) {
        requestAnimationFrame(() => input.focus());
    }
    const submit = document.getElementById('login-submit');
    if (submit && input) submit.disabled = !String(input.value || '').trim();
}

function hideLogin() {
    const overlay = document.getElementById('login-overlay');
    const input = document.getElementById('login-password');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    clearLoginError();
    if (input) input.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginOverlay = document.getElementById('login-overlay');
    const loginDialog = document.getElementById('login-dialog');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit');
    const toggleBtn = document.getElementById('login-password-toggle');
    const toggleIcon = document.getElementById('login-password-toggle-icon');

    const updateSubmitEnabled = () => {
        if (!submitBtn || !passwordInput) return;
        submitBtn.disabled = !String(passwordInput.value || '').trim();
    };

    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            clearLoginError();
            updateSubmitEnabled();
        });
    }

    if (toggleBtn && toggleIcon && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const showing = passwordInput.type === 'text';
            passwordInput.type = showing ? 'password' : 'text';
            toggleBtn.setAttribute('aria-pressed', showing ? 'false' : 'true');
            toggleBtn.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
            toggleIcon.className = showing ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
            passwordInput.focus();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (!loginOverlay || loginOverlay.classList.contains('hidden')) return;
        if (!loginDialog) return;
        if (e.key !== 'Tab') return;
        const focusable = Array.from(loginDialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
            .filter((el) => el instanceof HTMLElement && !el.hasAttribute('disabled') && el.tabIndex !== -1);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
            if (active === first || active === loginDialog) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (active === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pwd = passwordInput ? String(passwordInput.value || '') : '';
            const btn = submitBtn || loginForm.querySelector('button');
            const originalText = btn ? btn.innerHTML : '';

            try {
                if (!pwd.trim()) {
                    setLoginError('请输入管理员密码');
                    if (passwordInput) passwordInput.focus();
                    updateSubmitEnabled();
                    return;
                }

                clearLoginError();
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>验证中...';
                }

                const res = await originalFetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                });
                const data = await res.json();

                if (data.success) {
                    localStorage.setItem('adminToken', data.token);
                    hideLogin();
                    showToast('登录成功');
                    if (typeof loadStatus === 'function') loadStatus();
                } else {
                    setLoginError('密码错误，请重试');
                    showToast('密码错误', 'error');
                    if (passwordInput) {
                        passwordInput.value = '';
                        passwordInput.focus();
                    }
                }
            } catch (err) {
                setLoginError('登录请求失败，请检查网络或服务状态');
                showToast('登录请求失败', 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
                updateSubmitEnabled();
            }
        });
    }

    document.querySelectorAll('.nav-item[data-tab]').forEach((el) => {
        el.addEventListener('click', () => showTab(el.getAttribute('data-tab')));
    });

    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const toggle = document.getElementById('sidebar-toggle');
    const closeSidebar = () => {
        if (!sidebar || !backdrop || !toggle) return;
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
    };
    const openSidebar = () => {
        if (!sidebar || !backdrop || !toggle) return;
        sidebar.classList.remove('-translate-x-full');
        backdrop.classList.remove('hidden');
        toggle.setAttribute('aria-expanded', 'true');
    };

    if (toggle) {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            if (!sidebar || !backdrop) return;
            sidebar.classList.contains('-translate-x-full') ? openSidebar() : closeSidebar();
        });
    }
    if (backdrop) backdrop.addEventListener('click', closeSidebar);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSidebar();
    });
    window.addEventListener('resize', () => {
        if (!sidebar || !backdrop || !toggle) return;
        if (window.innerWidth >= 768) {
            sidebar.classList.remove('-translate-x-full');
            backdrop.classList.add('hidden');
            toggle.setAttribute('aria-expanded', 'false');
        } else {
            closeSidebar();
        }
    });

    loadServerMeta().catch(() => { });

    // Init Views
    showTab('dashboard');
});

async function loadServerMeta() {
    const badge = document.getElementById('server-meta-badge');
    const text = document.getElementById('server-meta-text');
    const subtitle = document.getElementById('server-meta-subtitle');
    const list = document.getElementById('server-changelog-list');
    const empty = document.getElementById('server-changelog-empty');
    const toggle = document.getElementById('server-changelog-toggle');
    const panel = document.getElementById('server-changelog-panel');
    const closeBtn = document.getElementById('server-changelog-close');

    if (!badge || !text || !subtitle || !list || !empty || !toggle || !panel || !closeBtn) return;

    const res = await originalFetch('/api/meta', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return;
    const meta = await res.json();
    const server = meta && meta.server ? meta.server : {};
    const version = typeof server.version === 'string' ? server.version : (typeof meta.version === 'string' ? meta.version : '');
    const build = typeof server.build === 'string' ? server.build : '';
    const builtAt = typeof server.builtAt === 'string' ? server.builtAt : '';
    const changelog = Array.isArray(server.changelog) ? server.changelog.filter(v => typeof v === 'string' && v.trim()) : [];

    const titleParts = [];
    if (version) titleParts.push(`v${version}`);
    if (build) titleParts.push(`#${build}`);
    text.textContent = titleParts.length > 0 ? titleParts.join(' ') : 'Server';

    // Also update dashboard version card
    const elVersion = document.getElementById('status-version');
    if (elVersion) elVersion.textContent = version ? `v${version}` : '-';

    const subtitleParts = [];
    if (builtAt) subtitleParts.push(`构建时间：${builtAt}`);
    if (build && !subtitleParts.length) subtitleParts.push(`构建号：${build}`);
    subtitle.textContent = subtitleParts.join(' ');

    list.innerHTML = '';
    if (changelog.length > 0) {
        empty.classList.add('hidden');
        for (const item of changelog) {
            const li = document.createElement('li');
            li.className = 'flex items-start';
            li.innerHTML = `<span class="mt-1 mr-2 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span><span>${escapeHtml(item)}</span>`;
            list.appendChild(li);
        }
        toggle.classList.remove('hidden');
    } else {
        empty.classList.remove('hidden');
        toggle.classList.add('hidden');
    }

    const show = () => panel.classList.remove('hidden');
    const hide = () => panel.classList.add('hidden');
    toggle.onclick = (e) => { e.preventDefault(); e.stopPropagation(); panel.classList.contains('hidden') ? show() : hide(); };
    closeBtn.onclick = (e) => { e.preventDefault(); hide(); };

    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (panel.classList.contains('hidden')) return;
        if (panel.contains(target) || toggle.contains(target)) return;
        hide();
    });
}

function escapeHtml(input) {
    const div = document.createElement('div');
    div.textContent = String(input);
    return div.innerHTML;
}

// --- UI/Navigation Logic ---

function showTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        el.removeAttribute('aria-current');
    });
    const navItem = document.getElementById('nav-' + tabId);
    if (navItem) {
        navItem.classList.add('active');
        navItem.setAttribute('aria-current', 'page');
    }

    // Update Title & Breadcrumb
    const titles = {
        'dashboard': '仪表盘',
        'settings': '系统设置',
        'users': '用户管理',
        'feeds': '订阅源管理',
        'images': '图片缓存',
        'logs': '系统日志',
        'maintenance': '维护工具'
    };
    const breadcrumbs = {
        'dashboard': 'Overview',
        'settings': 'System / Configuration',
        'users': 'System / Users',
        'feeds': 'Content / Feeds',
        'images': 'Content / Media',
        'logs': 'System / Logs',
        'maintenance': 'System / Maintenance'
    }
    document.getElementById('page-title').textContent = titles[tabId] || 'Console';
    document.getElementById('page-breadcrumb').textContent = breadcrumbs[tabId] || 'Overview';

    // Content switching
    document.querySelectorAll('#content-area > div').forEach(el => el.classList.add('hidden'));
    const view = document.getElementById('view-' + tabId);
    if (view) {
        view.classList.remove('hidden');
        // Lazy load data
        if (tabId === 'settings' && typeof loadSettings === 'function') loadSettings();
        if (tabId === 'users' && typeof loadUsers === 'function') loadUsers();
        if (tabId === 'feeds' && typeof loadFeeds === 'function') loadFeeds();
        if (tabId === 'images' && typeof loadImages === 'function') loadImages();
        if (tabId === 'logs' && typeof loadLogs === 'function') loadLogs();
    }

    if (window.innerWidth < 768) {
        const sb = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        const toggle = document.getElementById('sidebar-toggle');
        if (sb && backdrop && toggle) {
            sb.classList.add('-translate-x-full');
            backdrop.classList.add('hidden');
            toggle.setAttribute('aria-expanded', 'false');
        }
    }
}

function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    const iconEl = document.getElementById('toast-icon');

    msgEl.textContent = msg;

    if (type === 'error') {
        iconEl.className = 'text-red-400 mr-4 text-xl';
        iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    } else if (type === 'info') {
        iconEl.className = 'text-blue-400 mr-4 text-xl';
        iconEl.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
    } else {
        iconEl.className = 'text-emerald-400 mr-4 text-xl';
        iconEl.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    }

    el.classList.remove('translate-y-32', 'opacity-0');
    setTimeout(() => el.classList.add('translate-y-32', 'opacity-0'), 3000);
}

function isLikelyValidCronExpression(expr) {
    const s = String(expr || '').trim();
    if (!s) return true;
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length !== 5 && parts.length !== 6) return false;
    const allowed = /^[0-9*/,\-]+$/;
    return parts.every(p => allowed.test(p));
}

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0; let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds) {
    if (!seconds) return '-';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
}

// Global states used by multiple modules
const ARTICLES_PAGE_SIZE = 50;
const articlesState = {
    feedId: '', feedName: '', feedUrl: '', total: 0, offset: 0, loading: false
};

const relationsState = {
    mode: '',
    id: '',
    title: '',
    subtitle: ''
};

function openRelationsOverlay({ title, subtitle, mode, items }) {
    relationsState.mode = mode;
    relationsState.title = title || '关联信息';
    relationsState.subtitle = subtitle || '';
    document.getElementById('relations-title').textContent = relationsState.title;
    document.getElementById('relations-subtitle').textContent = relationsState.subtitle;

    const head = document.getElementById('relations-head');
    const body = document.getElementById('relations-list');

    if (mode === 'feedUsers') {
        head.innerHTML = `
        <tr>
            <th class="px-8 py-4 border-b border-slate-100/50">用户</th>
            <th class="px-8 py-4 border-b border-slate-100/50">邮箱</th>
            <th class="px-8 py-4 border-b border-slate-100/50 w-56">最后活跃</th>
            <th class="px-8 py-4 border-b border-slate-100/50 w-32 text-right">操作</th>
        </tr>
    `;
        const users = Array.isArray(items) ? items : [];
        body.innerHTML = users.map(u => `
        <tr class="hover:bg-white/60 transition">
            <td class="px-8 py-4">
                <div class="font-semibold text-slate-800 text-sm">${u.username || 'User'}</div>
                <div class="text-xs text-slate-400 font-mono mt-0.5">${u.id || '-'}</div>
            </td>
            <td class="px-8 py-4 text-xs text-slate-600 font-medium">${u.email || '-'}</td>
            <td class="px-8 py-4 text-xs text-slate-600 font-medium">${u.lastActive ? new Date(u.lastActive).toLocaleString() : '-'}</td>
            <td class="px-8 py-4 text-right">
                <button onclick="viewUserSettings('${u.id}')" class="text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition text-xs font-medium border border-blue-200 bg-white">
                    详情
                </button>
            </td>
        </tr>
    `).join('') || `<tr><td class="px-8 py-8 text-slate-500 italic" colspan="4">暂无订阅用户</td></tr>`;
    } else {
        head.innerHTML = `
        <tr>
            <th class="px-8 py-4 border-b border-slate-100/50">订阅源</th>
            <th class="px-8 py-4 border-b border-slate-100/50 w-1/2">源地址</th>
            <th class="px-8 py-4 border-b border-slate-100/50 w-28 text-center">文章数</th>
            <th class="px-8 py-4 border-b border-slate-100/50 w-28 text-center">订阅用户</th>
            <th class="px-8 py-4 border-b border-slate-100/50 w-40 text-right">操作</th>
        </tr>
    `;
        const feeds = Array.isArray(items) ? items : [];
        body.innerHTML = feeds.map(f => `
        <tr class="hover:bg-white/60 transition">
            <td class="px-8 py-4">
                <div class="font-semibold text-slate-800 text-sm">${f.name || 'Unnamed'}</div>
                <div class="text-xs text-slate-500 mt-0.5 font-medium">${f.category || 'General'}</div>
            </td>
            <td class="px-8 py-4">
                <a href="${f.url}" target="_blank" rel="noreferrer noopener" class="text-blue-600 hover:text-blue-800 hover:underline text-xs font-mono truncate block max-w-[520px]" title="${f.url}">
                    ${f.url}
                </a>
            </td>
            <td class="px-8 py-4 text-center">
                <button onclick="viewFeedArticles('${f.id}')" class="inline-flex items-center justify-center min-w-12 px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition" title="查看文章列表">
                    ${f.articleCount ?? 0}
                </button>
            </td>
            <td class="px-8 py-4 text-center">
                <button onclick="viewFeedSubscribers('${f.id}')" class="inline-flex items-center justify-center min-w-12 px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition" title="查看订阅用户">
                    ${f.subscriberCount ?? 0}
                </button>
            </td>
            <td class="px-8 py-4 text-right space-x-2">
                <button onclick="viewFeedArticles('${f.id}')" class="text-slate-500 hover:text-purple-600 p-2 rounded-lg hover:bg-purple-50 transition" title="查看文章">
                    <i class="fa-solid fa-list-ul"></i>
                </button>
                <button onclick="viewFeedSubscribers('${f.id}')" class="text-slate-500 hover:text-green-600 p-2 rounded-lg hover:bg-green-50 transition" title="查看订阅用户">
                    <i class="fa-solid fa-users"></i>
                </button>
            </td>
        </tr>
    `).join('') || `<tr><td class="px-8 py-8 text-slate-500 italic" colspan="5">暂无订阅源</td></tr>`;
    }

    document.getElementById('relations-overlay').classList.remove('hidden');
}

window.closeRelations = () => document.getElementById('relations-overlay').classList.add('hidden');
window.onRelationsOverlayClick = (ev) => { if (ev.target.id === 'relations-overlay') closeRelations(); };
