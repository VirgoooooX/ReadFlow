// 7. Images
async function loadImages() {
    const tbody = document.getElementById('images-list');
    const imageSkeleton = `
    <tr class="animate-pulse border-b border-slate-100">
        <td class="px-6 py-4"><div class="flex items-center"><div class="w-10 h-10 rounded bg-slate-200 mr-3"></div><div class="h-4 w-32 bg-slate-200 rounded"></div></div></td>
        <td class="px-6 py-4"><div class="h-4 w-16 bg-slate-200 rounded"></div></td>
        <td class="px-6 py-4"><div class="h-4 w-32 bg-slate-200 rounded"></div></td>
        <td class="px-6 py-4 text-right"><div class="h-8 w-8 bg-slate-200 rounded-full ml-auto"></div></td>
    </tr>
    `;
    if (!tbody.innerHTML.trim() || tbody.innerHTML.includes('animate-pulse')) {
        tbody.innerHTML = imageSkeleton.repeat(4);
    }

    const res = await fetch(`${API_BASE}/cache/images?limit=200&offset=0`);
    const data = await res.json();

    if (!data.images || data.images.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="100%" class="px-6 py-16 text-center bg-slate-50/30">
                <div class="flex flex-col items-center justify-center">
                    <div class="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-slate-400 mb-4 shadow-sm border border-slate-200">
                        <i class="fa-regular fa-images text-2xl"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-600">缓存为空</p>
                    <p class="text-xs mt-1 text-slate-400">目前没有任何图片缓存</p>
                </div>
            </td>
        </tr>
        `;
        return;
    }

    tbody.innerHTML = data.images.map(img => `
    <tr class="hover:bg-white/60 transition border-b border-slate-200/60 last:border-0">
        <td data-label="文件名" class="px-6 py-4">
            <a href="/cache/${img.name}" target="_blank" rel="noreferrer noopener" class="flex items-center group cursor-pointer">
                <div class="w-12 h-12 rounded-lg bg-slate-200 bg-cover bg-center mr-3 border border-slate-300 group-hover:border-blue-500 transition shadow-sm flex-shrink-0" style="background-image:url('/cache/${img.name}')"></div>
                <span class="text-blue-600 hover:underline text-xs font-mono truncate max-w-[200px] font-medium">${img.name}</span>
            </a>
        </td>
        <td data-label="大小" class="px-6 py-4 text-sm text-slate-700 font-mono font-medium">${formatBytes(img.size)}</td>
        <td data-label="生成时间" class="px-6 py-4 text-xs text-slate-600 font-medium">${new Date(img.mtimeMs).toLocaleString()}</td>
        <td data-label="操作" class="px-6 py-4 text-right">
            <button onclick="deleteImage('${img.name}')" class="text-slate-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </td>
    </tr>
`).join('');
}

window.deleteImage = async function (name) {
    if (!confirm('删除这张图片?')) return;
    await fetch(`${API_BASE}/cache/images/${encodeURIComponent(name)}`, { method: 'DELETE' });
    loadImages();
    showToast('图片已删除');
}
