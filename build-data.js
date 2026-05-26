/**
 * 《星之海洋》数据预处理脚本
 * 读取 chapters/ 目录下的 txt 文件，解析为结构化 JSON 供在线阅读器使用。
 *
 * 用法：node build-data.js
 */

const fs = require('fs');
const path = require('path');

const CHAPTERS_DIR = path.join(__dirname, 'chapters');
const OUTPUT_DIR = path.join(__dirname, 'reader', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'chapters.json');

// ── 1. 读取所有 txt 文件并按序号排序 ──────────────────────────────────────────

const files = fs.readdirSync(CHAPTERS_DIR)
  .filter(f => f.endsWith('.txt'))
  .map(f => {
    const match = f.match(/^(\d+)-(.+)\.txt$/);
    if (!match) return null;
    return { filename: f, index: parseInt(match[1], 10), rawName: match[2] };
  })
  .filter(Boolean)
  .sort((a, b) => a.index - b.index);

console.log(`找到 ${files.length} 个章节文件`);

// ── 2. 解析每个文件 ───────────────────────────────────────────────────────────

function parseChapter(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);

  // 文件格式:
  // ============================================================
  // 第 X 章
  // 章节标题_星之海洋
  // ============================================================
  // (空行)
  // 正文...

  let title = '';
  let contentStartLine = 0;

  // 寻找第二个分隔线，在两条分隔线之间获取标题
  let separatorCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('====')) {
      separatorCount++;
      if (separatorCount === 1) continue;
      if (separatorCount === 2) {
        contentStartLine = i + 1;
        break;
      }
    }
    if (separatorCount === 1 && !lines[i].trim().startsWith('第')) {
      // 这是标题行
      title = lines[i].trim().replace(/_星之海洋$/, '').replace(/_星之海洋\s*$/, '');
    }
  }

  // 提取正文（跳过开头空行）
  const contentLines = lines.slice(contentStartLine);
  const content = contentLines.join('\n').trim();

  return { title, content };
}

// ── 3. 识别卷信息并分组 ──────────────────────────────────────────────────────

function detectVolume(title) {
  // 序言/序
  if (/修订版序/.test(title) || /^序/.test(title)) {
    return '前言';
  }
  // 恶搞篇
  if (/恶搞/.test(title)) {
    return '恶搞篇';
  }
  // 外传
  if (/外传/.test(title)) {
    const match = title.match(/外传[．·.]\s*(.+?)\s*第/);
    if (match) return `外传·${match[1]}`;
    return '外传';
  }
  // 正传卷：提取"第X卷"后面到"第X章"或"The"之前的内容作为卷名
  const volMatch = title.match(/修订版(第.+?卷)\s+(.+?)[\s]*(?:第[一二三四五六七八九十百千]+章|The\s|$)/);
  if (volMatch) {
    return `${volMatch[1]} ${volMatch[2].trim()}`;
  }
  // 兜底
  return '其他';
}

// ── 4. 构建数据结构 ──────────────────────────────────────────────────────────

const seen = new Set(); // 用于去重
const volumeMap = new Map(); // 按卷分组
const volumeOrder = []; // 保持顺序
let globalId = 0;

for (const file of files) {
  const filePath = path.join(CHAPTERS_DIR, file.filename);
  const { title, content } = parseChapter(filePath);

  // 去重：标题完全相同则跳过
  if (seen.has(title)) {
    console.log(`  [跳过重复] ${file.filename} -> "${title}"`);
    continue;
  }
  seen.add(title);

  const volumeName = detectVolume(title);

  // 清理章节标题：去掉卷名前缀，只保留章节名
  let chapterTitle = title;
  // 去掉 "修订版第X卷 XXX " 前缀（兼容有空格和无空格的情况）
  chapterTitle = chapterTitle.replace(/^修订版第.+?卷\s+.+?\s*(?=第)/, '');
  // 去掉 "外传．XXX " 前缀
  chapterTitle = chapterTitle.replace(/^外传[．·.]\s*.+?\s*(?=第)/, '');

  if (!volumeMap.has(volumeName)) {
    volumeMap.set(volumeName, []);
    volumeOrder.push(volumeName);
  }

  globalId++;
  volumeMap.get(volumeName).push({
    id: globalId,
    title: chapterTitle,
    content: content
  });
}

const result = {
  title: '星之海洋',
  subtitle: '完本十周年修订版',
  author: 'charlesp',
  totalChapters: globalId,
  volumes: volumeOrder.map(name => ({
    name,
    chapters: volumeMap.get(name)
  }))
};

// ── 5. 输出 JSON ─────────────────────────────────────────────────────────────

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 0), 'utf-8');

const stats = fs.statSync(OUTPUT_FILE);
const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

console.log(`\n✓ 生成完毕！`);
console.log(`  文件：${OUTPUT_FILE}`);
console.log(`  大小：${sizeMB} MB`);
console.log(`  总卷数：${result.volumes.length}`);
console.log(`  总章数：${result.totalChapters}`);
console.log(`\n各卷章节数：`);
for (const vol of result.volumes) {
  console.log(`  ${vol.name}: ${vol.chapters.length} 章`);
}
