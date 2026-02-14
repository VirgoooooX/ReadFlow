/**
 * 批量修复 React Native 中文字符底部裁剪问题
 * 为所有 StyleSheet 中含 fontSize 但缺少 includeFontPadding 的样式添加修复属性
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

function findFiles(dir, extensions) {
    let results = [];
    for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
            results = results.concat(findFiles(full, extensions));
        } else if (extensions.some(ext => full.endsWith(ext))) {
            results.push(full);
        }
    }
    return results;
}

// lineHeight 映射表: fontSize -> 合适的 lineHeight
function getLineHeight(fontSize) {
    const map = {
        10: 16, 11: 16, 12: 18, 13: 20, 14: 20, 15: 22,
        16: 24, 17: 24, 18: 26, 19: 28, 20: 28, 22: 30,
        24: 32, 28: 36, 32: 40, 36: 44, 45: 52, 57: 64,
    };
    return map[fontSize] || Math.ceil(fontSize * 1.5);
}

let totalFiles = 0;
let totalFixes = 0;

for (const file of findFiles(srcDir, ['.tsx', '.ts'])) {
    // 跳过不包含 StyleSheet 的文件
    const content = fs.readFileSync(file, 'utf-8');
    if (!content.includes('fontSize')) continue;

    const lines = content.split(/\r?\n/);
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    const newLines = [];
    let modified = false;
    let fileFixCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 检查是否是 fontSize 行
        const fontSizeMatch = line.match(/fontSize:\s*(\d+)/);
        if (!fontSizeMatch) {
            newLines.push(line);
            continue;
        }

        const fontSize = parseInt(fontSizeMatch[1]);

        // 检查附近是否已有 includeFontPadding
        let hasInclude = false;
        for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 8); j++) {
            if (lines[j].includes('includeFontPadding')) {
                hasInclude = true;
                break;
            }
        }

        if (hasInclude) {
            newLines.push(line);
            continue;
        }

        // 获取缩进
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';

        // 至少4个空格缩进才处理（确保在样式块内）
        if (indent.length < 4) {
            newLines.push(line);
            continue;
        }

        // ---- 情况1: 单行样式定义 { fontSize: 15, fontWeight: '600' } ----
        if (line.includes('{') && line.includes('}')) {
            // 检查附近是否已有 lineHeight
            let hasLineHeight = line.includes('lineHeight');

            let newLine = line;
            if (!hasLineHeight) {
                newLine = newLine.replace('}', `, lineHeight: ${getLineHeight(fontSize)}, includeFontPadding: false }`);
            } else {
                newLine = newLine.replace('}', ', includeFontPadding: false }');
            }
            newLines.push(newLine);
            modified = true;
            fileFixCount++;
            continue;
        }

        // ---- 情况2: 多行样式定义 ----
        newLines.push(line);

        // 检查后面几行是否有 lineHeight
        let hasLineHeight = false;
        for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 8); j++) {
            if (lines[j].includes('lineHeight')) {
                hasLineHeight = true;
                break;
            }
        }

        // 添加 includeFontPadding: false（如果没有 lineHeight 也添加）
        if (!hasLineHeight) {
            newLines.push(`${indent}lineHeight: ${getLineHeight(fontSize)},`);
        }
        newLines.push(`${indent}includeFontPadding: false,`);
        modified = true;
        fileFixCount++;
    }

    if (modified) {
        fs.writeFileSync(file, newLines.join(lineEnding));
        totalFiles++;
        totalFixes += fileFixCount;
        const rel = path.relative(srcDir, file);
        console.log(`✅ ${rel} (${fileFixCount} fixes)`);
    }
}

console.log(`\n📊 总计: ${totalFiles} 个文件, ${totalFixes} 处修复`);
