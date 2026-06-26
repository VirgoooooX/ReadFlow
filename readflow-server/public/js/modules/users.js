// 5. Users
let _loadedUsers = [];

async function loadUsers() {
    const deck = document.getElementById('users-deck');
    if (!deck) return;
    const userSkeleton = `
    <div class="animate-pulse glass-card p-6 rounded-2xl h-44"></div>
    `;
    if (!deck.innerHTML.trim() || deck.innerHTML.includes('animate-pulse')) {
        deck.innerHTML = userSkeleton.repeat(3);
    }

    try {
        const res = await fetch(`${API_BASE}/users`);
        const users = await res.json();
        _loadedUsers = Array.isArray(users) ? users : [];

        if (_loadedUsers.length === 0) {
            deck.innerHTML = `
            <div class="col-span-full py-16 text-center">
                <div class="w-12 h-12 rounded-2xl bg-slate-950/60 flex items-center justify-center text-slate-500 mb-4 border border-white/5 mx-auto">
                    <i class="fa-solid fa-users-slash text-xl"></i>
                </div>
                <p class="text-sm font-bold text-slate-400">暂无用户</p>
                <p class="text-xs mt-1 text-slate-500">当前系统还没有注册任何用户</p>
            </div>
            `;
            return;
        }

        deck.innerHTML = _loadedUsers.map(u => `
        <div class="glass-card p-6 rounded-2xl flex flex-col space-y-4 border border-white/5" data-user-id="${u.id}">
            <!-- Header -->
            <div class="flex items-start justify-between">
                <div class="flex items-center space-x-3">
                    <div class="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-base font-bold shadow-md shadow-indigo-500/10">
                        ${u.username ? u.username.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                        <h4 class="font-bold text-white text-sm">${escapeHtml(u.username)}</h4>
                        <p class="text-[10px] text-slate-500 font-mono mt-0.5">ID: ${u.id.substring(0, 8)}...</p>
                    </div>
                </div>
                
                <div class="flex space-x-1">
                    <button onclick="toggleUserConfig('${u.id}')" title="配置 JSON" class="text-slate-400 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-white/5 transition">
                        <i class="fa-solid fa-code text-xs"></i>
                    </button>
                    <button onclick="deleteUser('${u.id}')" title="删除用户" class="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-white/5 transition">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>

            <!-- Metadata Fields -->
            <div class="grid grid-cols-2 gap-3 text-xs bg-slate-900/30 p-3 rounded-xl border border-white/5">
                <div>
                    <div class="text-[9px] text-slate-500 uppercase font-bold mb-0.5">联系邮箱</div>
                    <div class="text-slate-300 truncate" title="${u.email || ''}">${escapeHtml(u.email || '无')}</div>
                </div>
                <div>
                    <div class="text-[9px] text-slate-500 uppercase font-bold mb-0.5">订阅源数</div>
                    <button onclick="viewUserFeeds('${u.id}')" class="text-indigo-400 hover:underline font-bold text-left block">
                        ${u.feedCount ?? 0} 个源
                    </button>
                </div>
                <div>
                    <div class="text-[9px] text-slate-500 uppercase font-bold mb-0.5">注册时间</div>
                    <div class="text-slate-300 truncate">${u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '-'}</div>
                </div>
                <div>
                    <div class="text-[9px] text-slate-500 uppercase font-bold mb-0.5">最后活跃</div>
                    <div class="text-slate-300 truncate">${u.lastActive ? new Date(u.lastActive).toLocaleDateString() : '从未'}</div>
                </div>
            </div>

            <!-- Accordion Expandable JSON Area -->
            <div id="user-details-${u.id}" class="user-card-details space-y-3">
                <div class="border-t border-white/5 pt-3">
                    <div class="flex justify-between items-center mb-1.5">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">用户配置同步数据 (JSON)</span>
                        <span class="text-[9px] text-slate-500 font-mono">configSync</span>
                    </div>
                    <textarea id="user-json-${u.id}" rows="8" class="w-full bg-slate-950 text-emerald-400 font-mono text-[10px] p-3 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"></textarea>
                    <div class="flex justify-end mt-2">
                        <button onclick="saveUserConfig('${u.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm">
                            保存修改
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `).join('');
    } catch (e) {
        console.error(e);
        showToast('加载用户列表失败', 'error');
    }
}

window.toggleUserConfig = function (id) {
    const detailEl = document.getElementById(`user-details-${id}`);
    const textarea = document.getElementById(`user-json-${id}`);
    if (!detailEl || !textarea) return;

    const isOpen = detailEl.classList.contains('open');
    // Close others
    document.querySelectorAll('.user-card-details').forEach(el => el.classList.remove('open'));

    if (!isOpen) {
        const user = _loadedUsers.find(u => u.id === id);
        if (user) {
            const configSync = user?.config?.configSync || null;
            textarea.value = JSON.stringify(configSync, null, 2);
        }
        detailEl.classList.add('open');
    }
};

window.saveUserConfig = async function (id) {
    const textarea = document.getElementById(`user-json-${id}`);
    if (!textarea) return;
    const user = _loadedUsers.find(u => u.id === id);
    if (!user) return showToast('未找到该用户', 'error');

    let parsed = null;
    try {
        parsed = JSON.parse(textarea.value);
    } catch (err) {
        return showToast('JSON 语法错误，请检查格式', 'error');
    }

    try {
        const payload = {
            id: user.id,
            username: user.username,
            email: user.email,
            passwordHash: user.passwordHash,
            registeredAt: user.registeredAt,
            lastActive: user.lastActive,
            config: {
                configSync: parsed
            }
        };

        const res = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': localStorage.getItem('adminToken') || ''
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return showToast(data?.message || data?.error || '保存配置失败', 'error');
        }

        showToast('用户配置保存成功');
        loadUsers();
    } catch (e) {
        console.error(e);
        showToast('保存配置网络错误', 'error');
    }
};

async function addUser() {
    const username = String(document.getElementById('user-name')?.value || '').trim();
    const email = String(document.getElementById('user-email')?.value || '').trim();
    const password = String(document.getElementById('user-password')?.value || '').trim();
    if (!username || !email || !password) return showToast('请完整填写用户名、邮箱和密码', 'error');
    
    const res = await fetch(`/api/auth/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Token': localStorage.getItem('adminToken') || ''
        },
        body: JSON.stringify({ username, email, password })
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data?.message || data?.error || '创建失败', 'error');
        return;
    }
    document.getElementById('user-name').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-password').value = '';
    loadUsers();
    showToast('用户创建成功（可用邮箱登录）');
}

window.deleteUser = async function (id) {
    if (!confirm('确定删除该用户吗？')) return;
    await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
    loadUsers();
    showToast('用户已删除');
}

window.viewUserFeeds = async function (id) {
    try {
        const usersRes = await fetch(`${API_BASE}/users`);
        const users = await usersRes.json();
        const user = (users || []).find(u => u.id === id);

        const feedsRes = await fetch(`${API_BASE}/users/${id}/feeds`);
        const feeds = await feedsRes.json();

        openRelationsOverlay({
            title: `${user?.username || '用户'} · 订阅源`,
            subtitle: user?.id || id,
            mode: 'userFeeds',
            items: feeds,
        });
    } catch (e) {
        console.error(e);
        showToast('加载失败', 'error');
    }
}

window.viewFeedSubscribers = async function (id) {
    try {
        const feedsRes = await fetch(`${API_BASE}/feeds`);
        const feeds = await feedsRes.json();
        const feed = (feeds || []).find(f => f.id === id);

        const usersRes = await fetch(`${API_BASE}/feeds/${id}/users`);
        const users = await usersRes.json();

        openRelationsOverlay({
            title: `${feed?.name || '订阅源'} · 订阅用户`,
            subtitle: feed?.url || id,
            mode: 'feedUsers',
            items: users,
        });
    } catch (e) {
        console.error(e);
        showToast('加载失败', 'error');
    }
}

// Fallback compatibility link
window.viewUserSettings = function (id) {
    toggleUserConfig(id);
};
