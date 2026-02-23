// 4. Feeds
async function loadFeeds() {
    const tbody = document.getElementById('feeds-list');
    const feedSkeleton = `
    <tr class="animate-pulse border-b border-slate-100">
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
    if (!tbody.innerHTML.trim() || tbody.innerHTML.includes('animate-pulse')) {
        tbody.innerHTML = feedSkeleton.repeat(5);
    }

    const res = await fetch(`${API_BASE}/feeds`);
    const feeds = await res.json();

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
        return;
    }

    tbody.innerHTML = feeds.map(f => {
        const statusColor = f.lastRefreshStatus === 'ok' ? 'text-emerald-700' : (f.lastRefreshStatus === 'error' ? 'text-red-700' : 'text-slate-600');
        const statusBg = f.lastRefreshStatus === 'ok' ? 'bg-emerald-100' : (f.lastRefreshStatus === 'error' ? 'bg-red-100' : 'bg-slate-100');
        const statusText = f.lastRefreshStatus === 'ok' ? '正常' : (f.lastRefreshStatus === 'error' ? '错误' : '未知');

        return `
    <tr class="hover:bg-white/60 transition group border-b border-slate-200/60 last:border-0">
        <td data-label="源名称" class="px-6 py-4">
            <div class="flex items-center">
                <div class="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-600 mr-3 text-sm border border-slate-200">
                    <i class="fa-solid fa-rss"></i>
                </div>
                <div>
                    <div class="font-bold text-slate-800">${f.name || 'Unnamed'}</div>
                    <div class="text-xs text-slate-500 mt-0.5 font-medium">${f.category || 'General'}</div>
                </div>
            </div>
        </td>
        <td data-label="源地址" class="px-6 py-4">
            <a href="${f.url}" target="_blank" rel="noreferrer noopener" class="text-blue-600 hover:text-blue-800 hover:underline text-xs font-mono truncate block max-w-[240px]" title="${f.url}">
                ${f.url}
            </a>
        </td>
        <td data-label="文章数" class="px-6 py-4 text-center">
            <button onclick="viewFeedArticles('${f.id}')" class="inline-flex items-center justify-center min-w-12 px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition" title="查看文章列表">
                ${f.articleCount ?? 0}
            </button>
        </td>
        <td data-label="订阅用户" class="px-6 py-4 text-center">
            <button onclick="viewFeedSubscribers('${f.id}')" class="inline-flex items-center justify-center min-w-12 px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition" title="查看订阅用户">
                ${f.subscriberCount ?? 0}
            </button>
        </td>
        <td data-label="间隔(秒)" class="px-6 py-4 text-center">
            <input type="number" value="${f.refreshIntervalSeconds ?? ''}" 
                class="w-20 px-2 py-1 text-xs border border-slate-300 bg-white rounded text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm"
                onchange="updateFeedInterval('${f.id}', this.value)" placeholder="默认">
        </td>
        <td data-label="CRON" class="px-6 py-4 text-center">
            <input type="text" value="${f.refreshCron ?? ''}" 
                class="w-44 px-2 py-1 text-xs border border-slate-300 bg-white rounded text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm font-mono"
                onchange="updateFeedCron('${f.id}', this.value)" placeholder="Cron">
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
                <button onclick="refreshFeed('${f.id}')" class="text-slate-600 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition" title="立即刷新">
                    <i class="fa-solid fa-rotate"></i>
                </button>
                <button onclick="viewFeedArticles('${f.id}')" class="text-slate-600 hover:text-purple-600 p-2 rounded-lg hover:bg-purple-50 transition" title="查看文章">
                    <i class="fa-solid fa-list-ul"></i>
                </button>
                <button onclick="clearFeedData('${f.id}')" class="text-slate-600 hover:text-orange-600 p-2 rounded-lg hover:bg-orange-50 transition" title="清空数据">
                    <i class="fa-solid fa-eraser"></i>
                </button>
                <button onclick="deleteFeed('${f.id}')" class="text-slate-600 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition" title="删除订阅源">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </td>
    </tr>
`}).join('');
}

async function addFeed() {
    const name = document.getElementById('feed-name').value;
    const url = document.getElementById('feed-url').value;
    const category = document.getElementById('feed-category').value;
    const intervalRaw = document.getElementById('feed-interval').value;
    const refreshIntervalSeconds = intervalRaw === '' ? null : parseInt(intervalRaw);
    const refreshCronRaw = document.getElementById('feed-cron').value;
    const refreshCron = (refreshCronRaw || '').trim();

    if (!name || !url) return showToast('请填写名称和URL', 'error');
    if (refreshCron && !isLikelyValidCronExpression(refreshCron)) {
        return showToast('Cron 表达式格式不正确（需5或6段，用空格分隔）', 'error');
    }

    await fetch(`${API_BASE}/feeds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, category, refreshIntervalSeconds, refreshCron: refreshCron ? refreshCron : null })
    });

    document.getElementById('feed-name').value = '';
    document.getElementById('feed-url').value = '';
    document.getElementById('feed-category').value = '';
    document.getElementById('feed-cron').value = '';
    document.getElementById('add-feed-panel').classList.add('hidden');
    loadFeeds();
    showToast('订阅源添加成功');
}

window.updateFeedInterval = async function (id, val) {
    const refreshIntervalSeconds = val === '' ? null : parseInt(val);
    await fetch(`${API_BASE}/feeds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshIntervalSeconds })
    });
    showToast('更新成功');
}

window.updateFeedCron = async function (id, val) {
    const raw = String(val ?? '').trim();
    if (raw && !isLikelyValidCronExpression(raw)) {
        showToast('Cron 表达式格式不正确（需5或6段，用空格分隔）', 'error');
        loadFeeds();
        return;
    }
    const refreshCron = raw ? raw : null;
    await fetch(`${API_BASE}/feeds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshCron })
    });
    showToast('更新成功');
}

window.refreshFeed = async function (id) {
    showToast('已触发后台刷新...', 'info');
    await fetch(`${API_BASE}/feeds/${id}/refresh`, { method: 'POST' });
    setTimeout(loadFeeds, 1000);
}

window.deleteFeed = async function (id) {
    if (!confirm('确定删除该订阅源吗？')) return;
    await fetch(`${API_BASE}/feeds/${id}`, { method: 'DELETE' });
    loadFeeds();
    showToast('订阅源已删除');
}

window.clearFeedData = async function (id) {
    if (!confirm('确定清空该源的所有文章吗？')) return;
    await fetch(`${API_BASE}/feeds/${id}/data/clear`, { method: 'POST' });
    showToast('数据已清空');
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

