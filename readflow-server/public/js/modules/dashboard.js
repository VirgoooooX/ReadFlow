// 1. Dashboard / Status
async function loadStatus() {
    const stats = document.getElementById('dashboard-stats');
    if (!stats.innerHTML.trim() || stats.innerHTML.includes('animate-pulse')) {
        const skeletonCard = `
        <div class="glass-card p-6 rounded-xl flex items-center justify-between animate-pulse">
            <div>
                <div class="h-4 bg-slate-200 rounded w-16 mb-3"></div>
                <div class="h-8 bg-slate-200 rounded w-24"></div>
            </div>
            <div class="w-12 h-12 rounded-full bg-slate-100"></div>
        </div>
        `;
        // Only show skeleton if empty to avoid flashing on auto-refresh
        if (!stats.innerHTML.trim() || stats.children.length === 0) {
            stats.innerHTML = skeletonCard.repeat(4);
        }
    }

    try {
        const res = await fetch(`${API_BASE}/status`);
        const data = await res.json();

        document.getElementById('header-status').textContent = '系统正常';
        document.getElementById('header-status').parentElement.classList.replace('text-red-600', 'text-emerald-600');
        document.getElementById('header-status').parentElement.classList.replace('bg-red-50', 'bg-emerald-50/50');
        document.getElementById('header-status').parentElement.classList.replace('border-red-100', 'border-emerald-100/50');

        const card = (title, value, icon, color) => `

        <div class="glass-card p-6 rounded-xl flex items-center justify-between card-hover transition duration-200">
            <div>
                <p class="text-sm font-bold text-slate-600 mb-1">${title}</p>
                <p class="text-2xl font-extrabold text-slate-800">${value}</p>
            </div>
            <div class="w-12 h-12 rounded-full bg-${color}-50/80 flex items-center justify-center text-${color}-600 shadow-sm border border-${color}-100">
                <i class="${icon} text-xl"></i>
            </div>
        </div>
    `;

        stats.innerHTML = `
        ${card('总用户数', data.users ?? 0, 'fa-solid fa-users', 'blue')}
        ${card('订阅源', data.feeds ?? 0, 'fa-solid fa-rss', 'purple')}
        ${card('24h新增文章', data.storage?.recentArticleCount ?? 0, 'fa-regular fa-newspaper', 'pink')}
        ${card('数据库占用', formatBytes(data.storage?.dbSize ?? 0), 'fa-solid fa-database', 'emerald')}
    `;

        // System Status
        if (data.system) {
            const uptime = formatUptime(data.system.uptime);
            const mem = data.system.memoryUsage;
            const memUsed = mem ? formatBytes(mem.rss) : '-';
            // Estimate percentage relative to 512MB or 1GB just for visuals, or just show text
            // Let's assume 1GB for bar
            const memVal = mem ? mem.rss : 0;
            const memPercent = Math.min(100, (memVal / (1024 * 1024 * 1024)) * 100);

            const elUptime = document.getElementById('status-uptime');
            if (elUptime) elUptime.textContent = uptime;

            const elMem = document.getElementById('status-memory');
            if (elMem) elMem.textContent = memUsed;

            const elMemBar = document.getElementById('status-memory-bar');
            if (elMemBar) elMemBar.style.width = `${memPercent}%`;
        }
    } catch (e) {
        console.error(e);
        document.getElementById('header-status').textContent = '连接断开';
        const statusBadge = document.getElementById('header-status').parentElement;
        statusBadge.classList.replace('text-emerald-600', 'text-red-600');
        statusBadge.classList.replace('bg-emerald-50/50', 'bg-red-50');
        statusBadge.classList.replace('border-emerald-100/50', 'border-red-100');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadStatus();
    setInterval(loadStatus, 10000); // Auto refresh status every 10s
});
