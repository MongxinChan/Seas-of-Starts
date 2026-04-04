"""
笔趣阁小说爬虫
目标: https://www.xbqg77.com/36201
功能: 爬取所有章节，每章单独保存为 txt 文件，文件名格式: {序号}-{章节名}.txt
"""

import sys
import io
# 强制标准输出使用 UTF-8，避免 Windows 控制台 GBK 编码报错
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import os
import re
import time
import requests
from bs4 import BeautifulSoup

# ── 配置区 ────────────────────────────────────────────────────────────────────
BASE_URL   = "https://www.xbqg77.com"
BOOK_URL   = "https://www.xbqg77.com/36201"
OUTPUT_DIR = "chapters"          # 章节保存目录（相对于脚本所在位置）
DELAY      = 1.0                 # 每次请求间隔（秒），避免被封
ENCODING   = "utf-8"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": BASE_URL,
}
# ─────────────────────────────────────────────────────────────────────────────


def sanitize_filename(name: str) -> str:
    """去除文件名中不合法的字符"""
    return re.sub(r'[\\/*?:"<>|]', "_", name).strip()


def fetch(url: str, retries: int = 3) -> BeautifulSoup | None:
    """带重试的 GET 请求，返回 BeautifulSoup 对象"""
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding or ENCODING
            return BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            print(f"  [警告] 第 {attempt} 次请求失败 ({url}): {e}")
            if attempt < retries:
                time.sleep(2)
    print(f"  [错误] 跳过：{url}")
    return None


def get_chapter_list(book_url: str) -> list[dict]:
    """
    解析目录页，返回章节列表。
    每个元素: {'index': int, 'name': str, 'url': str}
    """
    print(f"正在获取目录：{book_url}")
    soup = fetch(book_url)
    if not soup:
        raise RuntimeError("无法获取目录页，请检查网络或 URL")

    links = soup.select(".chapter.container ol li a")
    if not links:
        raise RuntimeError("未找到章节列表，页面结构可能已变化")

    chapters = []
    for idx, a in enumerate(links, start=1):
        href = a.get("href", "").strip()
        name = a.get_text(strip=True)
        if not href or not name:
            continue
        full_url = BASE_URL + href if href.startswith("/") else href
        chapters.append({"index": idx, "name": name, "url": full_url})

    print(f"共找到 {len(chapters)} 章节")
    return chapters


def get_chapter_content(chapter: dict) -> str | None:
    """
    爬取单章正文，返回纯文本字符串。
    格式：
        第 {index} 章 | {name}
        =====================
        正文...
    """
    soup = fetch(chapter["url"])
    if not soup:
        return None

    # 章节标题
    title_tag = soup.select_one("h1.title") or soup.select_one("h1")
    title = title_tag.get_text(strip=True) if title_tag else chapter["name"]

    # 正文内容
    content_tag = soup.select_one("article#article") or soup.select_one("#content")
    if not content_tag:
        print(f"  [警告] 未找到正文容器：{chapter['url']}")
        return None

    # 将 <br> 转换为换行，再提取纯文本
    for br in content_tag.find_all("br"):
        br.replace_with("\n")
    raw_text = content_tag.get_text()

    # 清洗：去除常见广告短语、多余空行
    ad_patterns = [
        r"笔趣阁.*?最快更新",
        r"请记住本书首发域名.*",
        r"天才一秒记住.*?地址：.*",
        r"手机版阅读网址：.*",
        r"https?://\S+",
        r"www\.\S+",
    ]
    for pat in ad_patterns:
        raw_text = re.sub(pat, "", raw_text, flags=re.IGNORECASE)

    # 规范化空行（最多保留一个空行）
    lines = [line.strip() for line in raw_text.splitlines()]
    cleaned_lines: list[str] = []
    prev_blank = False
    for line in lines:
        if line == "":
            if not prev_blank:
                cleaned_lines.append("")
            prev_blank = True
        else:
            cleaned_lines.append(line)
            prev_blank = False

    body = "\n".join(cleaned_lines).strip()

    header = (
        f"{'=' * 60}\n"
        f"第 {chapter['index']} 章\n"
        f"{title}\n"
        f"{'=' * 60}\n\n"
    )
    return header + body + "\n"


def save_chapter(chapter: dict, content: str, output_dir: str) -> None:
    """将章节内容保存为 txt 文件"""
    filename = sanitize_filename(f"{chapter['index']}-{chapter['name']}.txt")
    filepath = os.path.join(output_dir, filename)
    with open(filepath, "w", encoding=ENCODING) as f:
        f.write(content)


def main() -> None:
    # 确保输出目录存在
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, OUTPUT_DIR)
    os.makedirs(output_dir, exist_ok=True)

    # 1. 获取章节目录
    chapters = get_chapter_list(BOOK_URL)

    # 2. 逐章爬取并保存
    success, failed = 0, 0
    for chapter in chapters:
        filename = sanitize_filename(f"{chapter['index']}-{chapter['name']}.txt")
        filepath = os.path.join(output_dir, filename)

        # 已存在则跳过（支持断点续爬）
        if os.path.exists(filepath):
            print(f"[跳过] {filename}（已存在）")
            success += 1
            continue

        print(f"[{chapter['index']}/{len(chapters)}] 正在下载：{chapter['name']}")
        content = get_chapter_content(chapter)

        if content:
            save_chapter(chapter, content, output_dir)
            print(f"  ✓ 已保存：{filename}")
            success += 1
        else:
            failed += 1

        time.sleep(DELAY)

    # 3. 汇总报告
    print("\n" + "=" * 60)
    print(f"下载完成！成功：{success} 章，失败：{failed} 章")
    print(f"文件保存路径：{output_dir}")


if __name__ == "__main__":
    main()
