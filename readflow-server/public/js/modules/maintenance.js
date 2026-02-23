// 3. Maintenance
async function clearCache() {
    if (!confirm('确定要清除所有图片缓存吗？这可能导致客户端重新下载图片。')) return;
    await fetch(`${API_BASE}/cache/clear`, { method: 'POST' });
    showToast('图片缓存已清除');
    if (typeof loadStatus === 'function') loadStatus();
}
async function clearArticles() {
    if (!confirm('确定要重置文章缓存吗？所有历史同步记录将被移除。')) return;
    await fetch(`${API_BASE}/articles/clear`, { method: 'POST' });
    showToast('文章缓存已重置');
    if (typeof loadStatus === 'function') loadStatus();
}
async function clearData() {
    const input = prompt('此操作将永久删除所有数据！请输入 "DELETE" 确认：');
    if (input !== 'DELETE') return;

    await fetch(`${API_BASE}/data/clear`, { method: 'POST' });
    showToast('工厂重置完成', 'info');
    setTimeout(() => location.reload(), 1000);
}
async function pruneArticles() {
    const days = document.getElementById('prune-articles-days').value;
    if (!confirm(`确定删除 ${days} 天前的所有文章吗？此操作不可恢复。`)) return;
    try {
        const res = await fetch(`${API_BASE}/maintenance/prune-articles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days })
        });
        const data = await res.json();
        if (data.success) showToast(data.message);
        else showToast('清理失败', 'error');
        if (typeof loadStatus === 'function') loadStatus();
    } catch (e) { showToast('请求失败', 'error'); }
}

async function pruneImages() {
    const days = document.getElementById('prune-images-days').value;
    if (!confirm(`确定删除 ${days} 天前的缓存图片吗？`)) return;
    try {
        const res = await fetch(`${API_BASE}/maintenance/prune-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days })
        });
        const data = await res.json();
        if (data.success) showToast(data.message);
        else showToast('清理失败', 'error');
        if (typeof loadStatus === 'function') loadStatus();
    } catch (e) { showToast('请求失败', 'error'); }
}
