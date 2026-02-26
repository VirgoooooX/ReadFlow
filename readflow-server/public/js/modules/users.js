// 5. Users
async function loadUsers() {
    const tbody = document.getElementById('users-list');
    const userSkeleton = `
    <tr class="animate-pulse border-b border-slate-100">
        <td class="px-6 py-4"><div class="flex items-center"><div class="w-9 h-9 rounded-full bg-slate-200 mr-3"></div><div><div class="h-4 w-24 bg-slate-200 rounded mb-2"></div><div class="h-3 w-16 bg-slate-100 rounded"></div></div></div></td>
        <td class="px-6 py-4"><div class="h-4 w-32 bg-slate-200 rounded"></div></td>
        <td class="px-6 py-4"><div class="h-4 w-20 bg-slate-200 rounded"></div></td>
        <td class="px-6 py-4"><div class="h-5 w-24 bg-slate-200 rounded"></div></td>
        <td class="px-6 py-4"><div class="h-6 w-12 bg-slate-200 rounded-full mx-auto"></div></td>
        <td class="px-6 py-4"><div class="flex justify-end space-x-2"><div class="w-12 h-8 rounded-lg bg-slate-200"></div><div class="w-12 h-8 rounded-lg bg-slate-200"></div></div></td>
    </tr>
    `;
    if (!tbody.innerHTML.trim() || tbody.innerHTML.includes('animate-pulse')) {
        tbody.innerHTML = userSkeleton.repeat(5);
    }

    const res = await fetch(`${API_BASE}/users`);
    const users = await res.json();

    if (!users || users.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="100%" class="px-6 py-16 text-center bg-slate-50/30">
                <div class="flex flex-col items-center justify-center">
                    <div class="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-slate-400 mb-4 shadow-sm border border-slate-200">
                        <i class="fa-solid fa-users-slash text-2xl"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-600">暂无用户</p>
                    <p class="text-xs mt-1 text-slate-400">当前系统还没有注册任何用户</p>
                </div>
            </td>
        </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map(u => `
    <tr class="hover:bg-white/60 transition border-b border-slate-200/60 last:border-0">
        <td data-label="用户" class="px-6 py-4">
            <div class="flex items-center">
                <div class="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm shadow-sm mr-3">
                    ${u.username ? u.username.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                    <div class="font-bold text-slate-800 text-sm">${u.username}</div>
                    <div class="text-xs text-slate-500 font-mono mt-0.5 font-medium">${u.id.substring(0, 8)}...</div>
                </div>
            </div>
        </td>
        <td data-label="联系方式" class="px-6 py-4 text-sm text-slate-700 font-medium">${u.email || '<span class="text-slate-400 italic">No Email</span>'}</td>
        <td data-label="注册时间" class="px-6 py-4 text-xs text-slate-600 font-medium">${u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '-'}</td>
        <td data-label="最后活跃" class="px-6 py-4 text-xs">
            <span class="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                ${u.lastActive ? new Date(u.lastActive).toLocaleString() : 'Never'}
            </span>
        </td>
        <td data-label="订阅源" class="px-6 py-4 text-center">
            <button onclick="viewUserFeeds('${u.id}')" class="inline-flex items-center justify-center min-w-12 px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition" title="查看该用户订阅源">
                ${u.feedCount ?? 0}
            </button>
        </td>
        <td data-label="操作" class="px-6 py-4 text-right space-x-2">
            <button onclick="viewUserSettings('${u.id}')" class="bg-slate-800 text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg transition text-xs font-medium shadow-sm">
                详情
            </button>
            <button onclick="deleteUser('${u.id}')" class="bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 rounded-lg transition text-xs font-medium shadow-sm">
                删除
            </button>
        </td>
    </tr>
`).join('');
}

async function addUser() {
    const username = document.getElementById('user-name').value;
    if (!username) return;
    await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    document.getElementById('user-name').value = '';
    loadUsers();
    showToast('用户创建成功');
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

// 6. User Settings Modal
window.viewUserSettings = async function (id) {
    const res = await fetch(`${API_BASE}/users`);
    const users = await res.json();
    const user = users.find(u => u.id === id);
    if (!user) return;

    document.getElementById('user-settings-title').textContent = user.username || 'User';
    document.getElementById('user-settings-subtitle').textContent = user.id;
    const configSync = user?.config?.configSync || null;
    const merged =
        configSync && typeof configSync === 'object'
            ? (() => {
                const { settings, ...rest } = configSync;
                const s = settings && typeof settings === 'object' ? settings : {};
                return { ...rest, ...s };
            })()
            : null;
    document.getElementById('user-settings-json').textContent = JSON.stringify(merged, null, 2);

    const meta = document.getElementById('user-settings-meta');
    const item = (label, val) => `
    <div class="bg-slate-50/50 p-4 rounded-xl border border-slate-100/50">
        <div class="text-xs font-bold text-slate-400 mb-1 uppercase">${label}</div>
        <div class="font-semibold text-slate-800 text-sm truncate" title="${val}">${val}</div>
    </div>
`;
    meta.innerHTML = `
    ${item('用户 ID', user.id)}
    ${item('电子邮箱', user.email || '-')}
    ${item('注册时间', user.registeredAt ? new Date(user.registeredAt).toLocaleString() : '-')}
    ${item('最后活跃', user.lastActive ? new Date(user.lastActive).toLocaleString() : '-')}
`;
    document.getElementById('user-settings-overlay').classList.remove('hidden');
}

window.closeUserSettings = () => document.getElementById('user-settings-overlay').classList.add('hidden');
window.onUserSettingsOverlayClick = (ev) => { if (ev.target.id === 'user-settings-overlay') closeUserSettings(); };
