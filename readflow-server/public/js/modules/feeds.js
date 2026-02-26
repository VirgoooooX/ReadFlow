// 4. Feeds
const feedsState = window.__feedsState || { all: [], view: [], selected: new Set() };
window.__feedsState = feedsState;

function _getFeedSelectionCount() {
    return feedsState.selected ? feedsState.selected.size : 0;
}

function _setBulkBarVisible() {
    const bar = document.getElementById('feeds-bulk-bar');
    const countEl = document.getElementById('feeds-bulk-count');
    const count = _getFeedSelectionCount();
    if (countEl) countEl.textContent = String(count);
    if (bar) bar.classList.toggle('hidden', count === 0);
}

function _updateSelectAllCheckbox() {
    const selectAll = document.getElementById('feeds-select-all');
    if (!selectAll) return;
    const visibleIds = (feedsState.view || []).map(f => String(f.id));
    if (visibleIds.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }
    const selectedIds = feedsState.selected || new Set();
    const selectedVisible = visibleIds.filter(id => selectedIds.has(id)).length;
    selectAll.checked = selectedVisible === visibleIds.length;
    selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
}

function _rebuildCategoryFilterOptions() {
    const el = document.getElementById('feeds-category-filter');
    if (!el) return;
    const current = String(el.value || '');
    const categories = Array.from(new Set((feedsState.all || []).map(f => String(f.category || 'General'))))
        .map(v => v.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    el.innerHTML = `<option value="">全部分类</option>` + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    el.value = current;
}

function _renderFeeds() {
    const tbody = document.getElementById('feeds-list');
    if (!tbody) return;
    const feeds = Array.isArray(feedsState.view) ? feedsState.view : [];

    if (!feeds || feeds.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="100%" class="px-6 py-16 text-center bg-slate-50/30">
                <div class="flex flex-col items-center justify-center">
                    <div class="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-slate-400 mb-4 shadow-sm border border-slate-200">
                        <i class="fa-solid fa-satellite-dish text-2xl"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-600">暂无内容</p>
                    <p class="text-xs mt-1 text-slate-400">还没有添加任何订阅源</p>
                </div>
            </td>
        </tr>
        `;
        _setBulkBarVisible();
        _updateSelectAllCheckbox();
        return;
    }

    const selectedIds = feedsState.selected || new Set();
    tbody.innerHTML = feeds.map(f => {
        const statusColor = f.lastRefreshStatus === 'ok' ? 'text-emerald-700' : (f.lastRefreshStatus === 'error' ? 'text-red-700' : 'text-slate-600');
        const statusBg = f.lastRefreshStatus === 'ok' ? 'bg-emerald-100' : (f.lastRefreshStatus === 'error' ? 'bg-red-100' : 'bg-slate-100');
        const statusText = f.lastRefreshStatus === 'ok' ? '正常' : (f.lastRefreshStatus === 'error' ? '错误' : '未知');
        const id = String(f.id);
        const checked = selectedIds.has(id) ? 'checked' : '';
        const category = String(f.category || 'General');
        const categoryEncoded = encodeURIComponent(category);
        return `
    <tr class="hover:bg-white/60 transition group border-b border-slate-200/60 last:border-0">
        <td class="px-6 py-4">
            <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                ${checked} onchange="toggleFeedSelect('${id}', this.checked)">
        </td>
        <td data-label="源名称" class="px-6 py-4 align-top">
            <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-600 text-sm border border-slate-200 mt-0.5 shrink-0">
                    <i class="fa-solid fa-rss"></i>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-start gap-2">
                        <div class="font-bold text-slate-800 truncate min-w-0 flex-1">${escapeHtml(f.name || 'Unnamed')}</div>
                        <button onclick="setCategoryFilter(decodeURIComponent('${categoryEncoded}'))"
                            class="text-[10px] text-slate-600 font-bold bg-slate-100 px-2 py-0.5 rounded hover:bg-slate-200 transition whitespace-nowrap shrink-0">
                            ${escapeHtml(category)}
                        </button>
                    </div>
                    <div class="text-[11px] text-slate-500 rf-clamp-2 mt-1 leading-snug cursor-pointer hover:text-blue-600 transition"
                         onclick="promptUpdateDescription('${id}', '${escapeHtml(f.description || '')}')"
                         title="点击修改简介: ${escapeHtml(f.description || '暂无简介')}">
                         ${escapeHtml(f.description || '暂无简介')}
                    </div>
                </div>
            </div>
        </td>
        <td data-label="源地址" class="px-6 py-4 align-top">
            <div class="flex items-center gap-2 min-w-0">
                <a href="${escapeHtml(f.url)}" target="_blank" rel="noreferrer noopener"
                    class="text-blue-600 hover:text-blue-800 hover:underline text-xs font-mono truncate min-w-0 flex-1"
                    title="${escapeHtml(f.url)}">
                    ${escapeHtml(f.url)}
                </a>
                <button onclick="toggleFeedPublic('${id}', ${!f.isPublic})"
                    class="px-2 py-0.5 text-[10px] font-bold rounded-full border ${f.isPublic ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50 text-slate-400'} hover:bg-slate-100 transition whitespace-nowrap shrink-0"
                    title="${f.isPublic ? '点击设为私有' : '点击设为公开'}">
                    ${f.isPublic ? '公开池' : '私有'}
                </button>
            </div>
        </td>
        <td data-label="文章数" class="px-6 py-4 text-center">
            <button onclick="viewFeedArticles('${id}')" class="inline-flex items-center justify-center min-w-12 px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition" title="查看文章列表">
                ${f.articleCount ?? 0}
            </button>
        </td>
        <td data-label="订阅用户" class="px-6 py-4 text-center">
            <button onclick="viewFeedSubscribers('${id}')" class="inline-flex items-center justify-center min-w-12 px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition" title="查看订阅用户">
                ${f.subscriberCount ?? 0}
            </button>
        </td>
        <td data-label="间隔(秒)" class="px-6 py-4 text-center">
            <input type="number" value="${f.refreshIntervalSeconds ?? ''}"
                class="w-20 px-2 py-1 text-xs border border-slate-300 bg-white rounded text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm"
                onchange="updateFeedInterval('${id}', this.value)" placeholder="默认">
        </td>
        <td data-label="CRON" class="px-6 py-4 text-center">
            <input type="text" value="${escapeHtml(f.refreshCron ?? '')}"
                class="w-44 px-2 py-1 text-xs border border-slate-300 bg-white rounded text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm font-mono"
                onchange="updateFeedCron('${id}', this.value)" placeholder="Cron">
        </td>
        <td data-label="最后更新" class="px-6 py-4 text-xs">
            <div class="text-slate-700 font-medium">${f.lastRefreshAt ? new Date(f.lastRefreshAt).toLocaleString() : '-'}</div>
            <div class="text-slate-500 text-[10px] mt-0.5 scale-90 origin-left">Last check</div>
        </td>
        <td data-label="状态" class="px-6 py-4 text-center">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${statusBg} ${statusColor} border border-black/5 whitespace-nowrap min-w-[52px] justify-center">
                <span class="w-1.5 h-1.5 rounded-full bg-current mr-1.5 flex-shrink-0"></span>
                ${statusText}
            </span>
            ${f.lastRefreshError ? `<i class="fa-solid fa-circle-info text-red-500 ml-1 cursor-help" title="${escapeHtml(f.lastRefreshError)}"></i>` : ''}
        </td>
        <td data-label="操作" class="px-6 py-4 text-right">
            <div class="flex justify-end space-x-1">
                <button onclick="refreshFeed('${id}')" class="text-slate-600 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition" title="立即刷新">
                    <i class="fa-solid fa-rotate"></i>
                </button>
                <button onclick="viewFeedArticles('${id}')" class="text-slate-600 hover:text-purple-600 p-2 rounded-lg hover:bg-purple-50 transition" title="查看文章">
                    <i class="fa-solid fa-list-ul"></i>
                </button>
                <button onclick="clearFeedData('${id}')" class="text-slate-600 hover:text-orange-600 p-2 rounded-lg hover:bg-orange-50 transition" title="清空数据">
                    <i class="fa-solid fa-eraser"></i>
                </button>
                <button onclick="deleteFeed('${id}')" class="text-slate-600 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition" title="删除订阅源">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </td>
    </tr>
`}).join('');

    _setBulkBarVisible();
    _updateSelectAllCheckbox();
}

window.applyFeedFilters = function () {
    const q = String(document.getElementById('feeds-search')?.value || '').trim().toLowerCase();
    const category = String(document.getElementById('feeds-category-filter')?.value || '');
    const pubMode = String(document.getElementById('feeds-public-filter')?.value || 'all');

    const next = (feedsState.all || []).filter(f => {
        const fCategory = String(f.category || 'General');
        if (category && fCategory !== category) return false;
        if (pubMode === 'public' && !f.isPublic) return false;
        if (pubMode === 'private' && !!f.isPublic) return false;
        if (!q) return true;
        const hay = [
            f.name,
            f.url,
            f.category,
            f.description,
        ].map(v => String(v || '').toLowerCase()).join(' ');
        return hay.includes(q);
    });

    feedsState.view = next;
    _renderFeeds();
}

window.setCategoryFilter = function (val) {
    const el = document.getElementById('feeds-category-filter');
    if (!el) return;
    el.value = String(val || '');
    window.applyFeedFilters();
}

window.toggleFeedSelect = function (id, checked) {
    if (!feedsState.selected) feedsState.selected = new Set();
    const key = String(id);
    if (checked) feedsState.selected.add(key);
    else feedsState.selected.delete(key);
    _setBulkBarVisible();
    _updateSelectAllCheckbox();
}

window.toggleSelectAllVisible = function (checked) {
    if (!feedsState.selected) feedsState.selected = new Set();
    const ids = (feedsState.view || []).map(f => String(f.id));
    for (const id of ids) {
        if (checked) feedsState.selected.add(id);
        else feedsState.selected.delete(id);
    }
    _renderFeeds();
}

window.clearFeedSelection = function () {
    if (!feedsState.selected) feedsState.selected = new Set();
    feedsState.selected.clear();
    _renderFeeds();
}

async function _runBatched(ids, limit, fn) {
    const queue = ids.slice();
    let ok = 0;
    let fail = 0;
    const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
        while (queue.length > 0) {
            const id = queue.shift();
            if (!id) continue;
            try {
                const res = await fn(id);
                if (res === true) ok += 1;
                else fail += 1;
            } catch {
                fail += 1;
            }
        }
    });
    await Promise.all(workers);
    return { ok, fail };
}

function _getSelectedIds() {
    return Array.from(feedsState.selected || []).map(v => String(v));
}

window.bulkSetPublic = async function (isPublic) {
    const ids = _getSelectedIds();
    if (ids.length === 0) return;
    showToast('批量操作中...', 'info');
    const r = await _runBatched(ids, 3, async (id) => {
        const res = await fetch(`${API_BASE}/feeds/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isPublic: !!isPublic }),
        });
        return res.ok;
    });
    loadFeeds();
    showToast(`完成：成功 ${r.ok}，失败 ${r.fail}`);
}

window.bulkUpdateCategory = async function () {
    const ids = _getSelectedIds();
    if (ids.length === 0) return;
    const val = String(document.getElementById('feeds-bulk-category')?.value || '').trim();
    if (!val) return showToast('请输入新分类', 'error');
    showToast('批量操作中...', 'info');
    const r = await _runBatched(ids, 3, async (id) => {
        const res = await fetch(`${API_BASE}/feeds/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: val }),
        });
        return res.ok;
    });
    loadFeeds();
    showToast(`完成：成功 ${r.ok}，失败 ${r.fail}`);
}

window.bulkRefreshFeeds = async function () {
    const ids = _getSelectedIds();
    if (ids.length === 0) return;
    showToast('批量刷新中...', 'info');
    const r = await _runBatched(ids, 2, async (id) => {
        const res = await fetch(`${API_BASE}/feeds/${id}/refresh`, { method: 'POST' });
        return res.ok;
    });
    setTimeout(loadFeeds, 1000);
    showToast(`完成：成功 ${r.ok}，失败 ${r.fail}`);
}

window.bulkClearFeedData = async function () {
    const ids = _getSelectedIds();
    if (ids.length === 0) return;
    if (!confirm(`确定清空所选 ${ids.length} 个源的所有文章缓存吗？`)) return;
    showToast('清空中...', 'info');
    const r = await _runBatched(ids, 3, async (id) => {
        const res = await fetch(`${API_BASE}/feeds/${id}/data/clear`, { method: 'POST' });
        return res.ok;
    });
    showToast(`完成：成功 ${r.ok}，失败 ${r.fail}`);
}

window.bulkDeleteFeeds = async function () {
    const ids = _getSelectedIds();
    if (ids.length === 0) return;
    if (!confirm(`确定删除所选 ${ids.length} 个订阅源吗？`)) return;
    showToast('删除中...', 'info');
    const r = await _runBatched(ids, 3, async (id) => {
        const res = await fetch(`${API_BASE}/feeds/${id}`, { method: 'DELETE' });
        return res.ok;
    });
    feedsState.selected.clear();
    loadFeeds();
    showToast(`完成：成功 ${r.ok}，失败 ${r.fail}`);
}

async function loadFeeds() {
    const tbody = document.getElementById('feeds-list');
    const feedSkeleton = `
    <tr class="animate-pulse border-b border-slate-100">
        <td class="px-6 py-4"><div class="h-4 w-4 bg-slate-200 rounded"></div></td>
        <td class="px-6 py-4"><div class="flex items-center"><div class="w-8 h-8 rounded bg-slate-200 mr-3"></div><div><div class="h-4 w-32 bg-slate-200 rounded mb-1"></div><div class="h-3 w-20 bg-slate-100 rounded"></div></div></div></td>
        <td class="px-6 py-4"><div class="h-4 w-48 bg-slate-200 rounded"></div></td>
        <td class="px-6 py-4 text-center"><div class="h-6 w-12 bg-slate-200 rounded-full mx-auto"></div></td>
        <td class="px-6 py-4 text-center"><div class="h-6 w-12 bg-slate-200 rounded-full mx-auto"></div></td>
        <td class="px-6 py-4 text-center"><div class="h-6 w-20 bg-slate-200 rounded mx-auto"></div></td>
        <td class="px-6 py-4 text-center"><div class="h-6 w-44 bg-slate-200 rounded mx-auto"></div></td>
        <td class="px-6 py-4"><div class="h-4 w-24 bg-slate-200 rounded mb-1"></div><div class="h-3 w-16 bg-slate-100 rounded"></div></td>
        <td class="px-6 py-4 text-center"><div class="h-5 w-16 bg-slate-200 rounded-full mx-auto"></div></td>
        <td class="px-6 py-4 text-right"><div class="flex justify-end space-x-2"><div class="w-8 h-8 rounded-lg bg-slate-200"></div><div class="w-8 h-8 rounded-lg bg-slate-200"></div><div class="w-8 h-8 rounded-lg bg-slate-200"></div></div></td>
    </tr>
    `;
    if (tbody && (!tbody.innerHTML.trim() || tbody.innerHTML.includes('animate-pulse'))) {
        tbody.innerHTML = feedSkeleton.repeat(5);
    }

    const res = await fetch(`${API_BASE}/feeds`);
    const feeds = await res.json();
    feedsState.all = Array.isArray(feeds) ? feeds : [];
    if (!feedsState.selected) feedsState.selected = new Set();
    const idSet = new Set((feedsState.all || []).map(f => String(f.id)));
    feedsState.selected = new Set(Array.from(feedsState.selected).filter(id => idSet.has(String(id))));
    _rebuildCategoryFilterOptions();
    window.applyFeedFilters();
}

async function addFeed() {
    const name = document.getElementById('feed-name').value;
    const url = document.getElementById('feed-url').value;
    const category = document.getElementById('feed-category').value;
    const intervalRaw = document.getElementById('feed-interval').value;
    const refreshIntervalSeconds = intervalRaw === '' ? null : parseInt(intervalRaw);
    const refreshCronRaw = document.getElementById('feed-cron').value;
    const refreshCron = (refreshCronRaw || '').trim();
    const isPublic = document.getElementById('feed-is-public').checked;
    const description = document.getElementById('feed-description').value;

    if (!name || !url) return showToast('请填写名称和URL', 'error');
    if (refreshCron && !isLikelyValidCronExpression(refreshCron)) {
        return showToast('Cron 表达式格式不正确（需5或6段，用空格分隔）', 'error');
    }

    const res = await fetch(`${API_BASE}/feeds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, category, refreshIntervalSeconds, refreshCron: refreshCron ? refreshCron : null, isPublic, description })
    });

    if (!res.ok) {
        const err = await res.json();
        return showToast(err.error || '添加失败', 'error');
    }

    document.getElementById('feed-name').value = '';
    document.getElementById('feed-url').value = '';
    document.getElementById('feed-category').value = '';
    document.getElementById('feed-cron').value = '';
    document.getElementById('feed-description').value = '';
    document.getElementById('feed-is-public').checked = false;
    document.getElementById('add-feed-panel').classList.add('hidden');
    loadFeeds();
    showToast('订阅源添加成功');
}

window.toggleFeedPublic = async function (id, isPublic) {
    const res = await fetch(`${API_BASE}/feeds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic })
    });
    if (res.ok) {
        showToast(isPublic ? '已设为公开池源' : '已设为私有源');
        loadFeeds();
    } else {
        const err = await res.json();
        showToast(err.error || '操作失败', 'error');
    }
}

window.updateFeedInterval = async function (id, val) {
    const refreshIntervalSeconds = val === '' ? null : parseInt(val);
    const res = await fetch(`${API_BASE}/feeds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshIntervalSeconds })
    });
    if (res.ok) {
        showToast('更新成功');
    } else {
        const err = await res.json();
        showToast(err.error || '更新失败', 'error');
        loadFeeds();
    }
}

window.updateFeedCron = async function (id, val) {
    const raw = String(val ?? '').trim();
    if (raw && !isLikelyValidCronExpression(raw)) {
        showToast('Cron 表达式格式不正确（需5或6段，用空格分隔）', 'error');
        loadFeeds();
        return;
    }
    const refreshCron = raw ? raw : null;
    const res = await fetch(`${API_BASE}/feeds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshCron })
    });
    if (res.ok) {
        showToast('更新成功');
    } else {
        const err = await res.json();
        showToast(err.error || '更新失败', 'error');
        loadFeeds();
    }
}

window.promptUpdateDescription = async function (id, currentVal) {
    const newVal = prompt('请输入新的订阅源简介:', currentVal);
    if (newVal === null) return;
    const res = await fetch(`${API_BASE}/feeds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: newVal })
    });
    if (res.ok) {
        showToast('简介更新成功');
        loadFeeds();
    } else {
        const err = await res.json();
        showToast(err.error || '更新失败', 'error');
    }
}

window.refreshFeed = async function (id) {
    showToast('已触发后台刷新...', 'info');
    await fetch(`${API_BASE}/feeds/${id}/refresh`, { method: 'POST' });
    setTimeout(loadFeeds, 1000);
}

window.deleteFeed = async function (id) {
    if (!confirm('确定删除该订阅源吗？')) return;
    const res = await fetch(`${API_BASE}/feeds/${id}`, { method: 'DELETE' });
    if (res.ok) {
        loadFeeds();
        showToast('订阅源已删除');
    } else {
        const err = await res.json();
        showToast(err.error || '删除失败', 'error');
    }
}

window.clearFeedData = async function (id) {
    if (!confirm('确定清空该源的所有文章吗？')) return;
    const res = await fetch(`${API_BASE}/feeds/${id}/data/clear`, { method: 'POST' });
    if (res.ok) {
        showToast('数据已清空');
    } else {
        const err = await res.json();
        showToast(err.error || '清理失败', 'error');
    }
}

window.openImportFeedsDialog = function () {
    const input = document.getElementById('feeds-import-file');
    if (!input) return;
    input.click();
}

function _normalizeHeaderKey(raw) {
    const k = String(raw || '').trim().toLowerCase();
    if (!k) return '';
    const map = {
        'rss地址': 'url',
        'rss': 'url',
        '地址': 'url',
        '链接': 'url',
        'url': 'url',
        '名称': 'name',
        'name': 'name',
        '标题': 'name',
        '分类': 'category',
        'category': 'category',
        '简介': 'description',
        'description': 'description',
        '公开': 'isPublic',
        'ispubic': 'isPublic',
        'ispublic': 'isPublic',
        '间隔(秒)': 'refreshIntervalSeconds',
        '间隔': 'refreshIntervalSeconds',
        'refreshintervalseconds': 'refreshIntervalSeconds',
        'cron': 'refreshCron',
        'refreshcron': 'refreshCron',
        '启用': 'isActive',
        'isactive': 'isActive',
    };
    return map[k] || k;
}

function _parseBoolLike(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return false;
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on') return true;
    if (s === '是' || s === '对' || s === '开启' || s === '开' || s === '公开') return true;
    return false;
}

function _parseCsv(text) {
    const input = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let cur = '';
    let i = 0;
    let inQuotes = false;
    while (i < input.length) {
        const ch = input[i];
        if (inQuotes) {
            if (ch === '"') {
                if (input[i + 1] === '"') {
                    cur += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i += 1;
                continue;
            }
            cur += ch;
            i += 1;
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            i += 1;
            continue;
        }
        if (ch === ',') {
            row.push(cur);
            cur = '';
            i += 1;
            continue;
        }
        if (ch === '\r') {
            i += 1;
            continue;
        }
        if (ch === '\n') {
            row.push(cur);
            cur = '';
            if (row.some(c => String(c).trim() !== '')) rows.push(row);
            row = [];
            i += 1;
            continue;
        }
        cur += ch;
        i += 1;
    }
    row.push(cur);
    if (row.some(c => String(c).trim() !== '')) rows.push(row);
    return rows;
}

function _rowsToObjects(rows) {
    if (!rows || rows.length === 0) return [];
    const headerRow = rows[0];
    const headers = headerRow.map(_normalizeHeaderKey);
    const objects = [];
    for (let r = 1; r < rows.length; r += 1) {
        const rawRow = rows[r] || [];
        const obj = {};
        for (let c = 0; c < headers.length; c += 1) {
            const key = headers[c];
            if (!key) continue;
            obj[key] = rawRow[c];
        }
        const hasAny = Object.values(obj).some(v => String(v ?? '').trim() !== '');
        if (hasAny) objects.push(obj);
    }
    return objects;
}

async function _importFeedRecords(records) {
    const items = Array.isArray(records) ? records : [];
    if (items.length === 0) {
        showToast('未发现可导入的数据', 'error');
        return;
    }
    if (!confirm(`确认导入 ${items.length} 条订阅源？重复 URL 将会覆盖更新。`)) return;

    let ok = 0;
    let fail = 0;
    showToast(`开始导入 ${items.length} 条...`, 'info');

    for (let idx = 0; idx < items.length; idx += 1) {
        const r = items[idx] || {};
        const url = String(r.url || r.feedUrl || r.link || '').trim();
        if (!url) {
            fail += 1;
            continue;
        }
        const name = String(r.name || '').trim() || url;
        const category = String(r.category || '').trim() || 'General';
        const description = r.description === undefined ? undefined : String(r.description ?? '').trim();
        const refreshIntervalSecondsRaw = String(r.refreshIntervalSeconds ?? '').trim();
        const refreshIntervalSeconds = refreshIntervalSecondsRaw === '' ? null : parseInt(refreshIntervalSecondsRaw, 10);
        const refreshCronRaw = String(r.refreshCron ?? '').trim();
        const refreshCron = refreshCronRaw === '' ? null : refreshCronRaw;
        const isPublic = _parseBoolLike(r.isPublic);

        try {
            const res = await fetch(`${API_BASE}/feeds`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    url,
                    category,
                    description,
                    refreshIntervalSeconds,
                    refreshCron,
                    isPublic,
                }),
            });
            if (!res.ok) {
                fail += 1;
                continue;
            }
            ok += 1;
        } catch {
            fail += 1;
        }
    }

    loadFeeds();
    showToast(`导入完成：成功 ${ok}，失败 ${fail}`);
}

window.importFeedsFromFile = async function (file) {
    try {
        if (!file) return;
        const name = String(file.name || '').toLowerCase();
        if (name.endsWith('.csv')) {
            const text = await file.text();
            const rows = _parseCsv(text);
            const records = _rowsToObjects(rows);
            await _importFeedRecords(records);
            return;
        }

        if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
            const xlsx = window.XLSX;
            if (!xlsx) {
                showToast('当前控制台未加载 Excel 解析组件，请先将 Excel 另存为 CSV 再导入。', 'error');
                return;
            }
            const buf = await file.arrayBuffer();
            const wb = xlsx.read(buf, { type: 'array' });
            const sheetName = wb.SheetNames && wb.SheetNames[0];
            if (!sheetName) {
                showToast('Excel 文件为空或无法解析', 'error');
                return;
            }
            const sheet = wb.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
            const records = _rowsToObjects(rows);
            await _importFeedRecords(records);
            return;
        }

        showToast('仅支持导入 CSV 或 Excel(xlsx/xls)', 'error');
    } catch (e) {
        console.error(e);
        showToast(e?.message || '导入失败', 'error');
    }
}

window.exportFeeds = async function (format) {
    try {
        showToast('正在导出...', 'info');
        const res = await fetch(`${API_BASE}/feeds`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '导出失败');
        }
        const feeds = await res.json();
        const datePart = new Date().toISOString().slice(0, 10);

        const headers = [
            'id',
            'url',
            'name',
            'category',
            'description',
            'isPublic',
            'createdAt',
            'updatedAt',
            'refreshIntervalSeconds',
            'refreshCron',
            'lastRefreshAt',
            'lastRefreshStatus',
            'lastRefreshError',
            'articleCount',
            'subscriberCount',
        ];

        const escapeCsv = (v) => {
            const s = v === null || v === undefined ? '' : String(v);
            if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };

        const rows = (feeds || []).map((f) => headers.map((h) => escapeCsv(f?.[h])).join(','));
        const csv = '\ufeff' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `feeds_export_${datePart}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('已导出 CSV');
    } catch (e) {
        console.error(e);
        showToast(e?.message || '导出失败', 'error');
    }
}

// Articles Modal
window.viewFeedArticles = async function (id) {
    const feedsRes = await fetch(`${API_BASE}/feeds`);
    const feeds = await feedsRes.json();
    const feed = (feeds || []).find(f => f.id === id);

    articlesState.feedId = id;
    articlesState.feedName = feed?.name || 'Unknown Feed';
    articlesState.feedUrl = feed?.url || '';
    articlesState.total = 0;
    articlesState.offset = 0;
    articlesState.loading = false;

    document.getElementById('articles-title').textContent = articlesState.feedName;
    document.getElementById('articles-subtitle').textContent = articlesState.feedUrl;
    document.getElementById('articles-list').innerHTML = '';
    document.getElementById('articles-load-more').disabled = false;
    document.getElementById('articles-empty').classList.add('hidden');
    document.getElementById('articles-count-badge').textContent = '';

    document.getElementById('articles-overlay').classList.remove('hidden');
    await loadMoreArticles(true);
}

window.closeArticles = () => document.getElementById('articles-overlay').classList.add('hidden');
window.onArticlesOverlayClick = (ev) => { if (ev.target.id === 'articles-overlay') closeArticles(); };

function _formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
    return date.toLocaleDateString();
}

window.loadMoreArticles = async function (reset = false) {
    if (!articlesState.feedId || articlesState.loading) return;
    articlesState.loading = true;
    const btn = document.getElementById('articles-load-more');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>加载中...';

    try {
        const res = await fetch(`${API_BASE}/feeds/${articlesState.feedId}/articles?limit=${ARTICLES_PAGE_SIZE}&offset=${articlesState.offset}`);
        const data = await res.json();
        const items = data.articles || [];

        if (reset) document.getElementById('articles-list').innerHTML = '';

        const container = document.getElementById('articles-list');

        if (reset && items.length === 0) {
            document.getElementById('articles-empty').classList.remove('hidden');
            btn.disabled = true;
            btn.textContent = '暂无文章';
            articlesState.loading = false;
            return;
        }
        document.getElementById('articles-empty').classList.add('hidden');

        const html = items.map((a, idx) => {
            const timeStr = a.publishedAt ? new Date(a.publishedAt).toLocaleString() : '';
            const relativeTime = _formatRelativeTime(a.publishedAt);
            const globalIdx = articlesState.offset + idx + 1;

            return `
            <div class="bg-white rounded-xl border border-slate-200/80 hover:border-slate-300 hover:shadow-md transition-all duration-200 group">
                <a href="${a.url}" target="_blank" rel="noreferrer noopener" class="flex items-stretch p-4 no-underline">
                    <!-- Left: Text Content -->
                    <div class="flex-1 min-w-0 pr-4">
                        <div class="flex items-center space-x-2 mb-2">
                            <span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">#${globalIdx}</span>
                            ${relativeTime ? `<span class="text-[11px] text-slate-400 font-medium">${relativeTime}</span>` : ''}
                        </div>
                        <h4 class="text-sm font-bold text-slate-800 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors mb-1.5">${escapeHtml(a.title)}</h4>
                        <div class="flex items-center space-x-3 text-[11px] text-slate-400">
                            ${timeStr ? `<span><i class="fa-regular fa-clock mr-1"></i>${timeStr}</span>` : ''}
                            <span class="truncate max-w-[200px] font-mono">${new URL(a.url).hostname}</span>
                        </div>
                    </div>
                    <!-- Right: Cover Image -->
                    ${a.imageUrl ? `
                    <div class="flex-shrink-0 w-28 h-20 rounded-lg bg-slate-100 bg-cover bg-center border border-slate-200 overflow-hidden"
                         style="background-image:url('${a.imageUrl}')">
                    </div>` : ''}
                </a>
            </div>`;
        }).join('');
        container.insertAdjacentHTML('beforeend', html);

        articlesState.total = data.total ?? 0;
        articlesState.offset += items.length;
        document.getElementById('articles-progress').textContent = `${articlesState.offset} / ${articlesState.total} 已加载`;
        document.getElementById('articles-count-badge').textContent = `${articlesState.total} 篇`;

        if ((articlesState.total > 0 && articlesState.offset >= articlesState.total) || items.length === 0) {
            btn.disabled = true;
            btn.textContent = '已加载全部';
        } else {
            btn.disabled = false;
            btn.textContent = '加载更多';
        }
    } catch (e) {
        console.error(e);
        btn.textContent = '加载失败';
        showToast('加载失败', 'error');
    } finally {
        articlesState.loading = false;
    }
}

