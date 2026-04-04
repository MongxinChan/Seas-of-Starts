#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <regex>
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#include <memory>

std::wstring utf8_to_utf16(const std::string& utf8) {
    if (utf8.empty()) return L"";
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), (int)utf8.size(), NULL, 0);
    std::wstring utf16(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), (int)utf8.size(), &utf16[0], size_needed);
    return utf16;
}

std::string utf16_to_utf8(const std::wstring& utf16) {
    if (utf16.empty()) return "";
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, utf16.c_str(), (int)utf16.size(), NULL, 0, NULL, NULL);
    std::string utf8(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, utf16.c_str(), (int)utf16.size(), &utf8[0], size_needed, NULL, NULL);
    return utf8;
}

// 使用 _wfopen 读取文件以支持宽字符路径
std::string read_file_w(const std::wstring& filepath) {
    FILE* fp = _wfopen(filepath.c_str(), L"rb");
    if (!fp) return "";
    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    std::string content(size, 0);
    fread(&content[0], 1, size, fp);
    fclose(fp);
    return content;
}

// 使用 _wfopen 写入文件
void write_file_w(const std::wstring& filepath, const std::string& content) {
    FILE* fp = _wfopen(filepath.c_str(), L"wb");
    if (!fp) return;
    fwrite(content.c_str(), 1, content.size(), fp);
    fclose(fp);
}

void process_file(const std::wstring& filepath) {
    std::string content = read_file_w(filepath);
    if (content.empty()) return;

    std::wstring wcontent;
    bool has_bom = (content.size() >= 3 && (unsigned char)content[0] == 0xEF && (unsigned char)content[1] == 0xBB && (unsigned char)content[2] == 0xBF);
    if (has_bom) {
        wcontent = utf8_to_utf16(content.substr(3));
    } else {
        wcontent = utf8_to_utf16(content);
    }

    std::vector<std::wstring> patterns = {
        L"[\\|《]?笔[？×＆％｜．。～·、]{0,2}趣[？×＆％｜．。～·、]{0,2}阁[》]?[\\sｗwＷW0-9]*[。\\.．·]?[ｂb][ｉi][ｑq][ｕu][ｇg][ｅe][。\\.．·]?[ｉi][ｎn][ｆf][ｏo]",
        L"[\\|《]?笔[？×＆％｜．。～·、]{1,2}趣[？×＆％｜．。～·、]{1,2}阁[》]?",
        L"笔趣阁[\\sｗwＷW0-9\\.。．·]*[ｂb][ｉi][ｑq][ｕu][ｇg][ｅe][\\.。．·]*[ｉi][ｎn][ｆf][ｏo]"
    };

    bool modified = false;
    for (const auto& pattern : patterns) {
        try {
            std::wregex re(pattern, std::regex_constants::icase);
            std::wstring next_content = std::regex_replace(wcontent, re, L"");
            if (next_content != wcontent) {
                wcontent = next_content;
                modified = true;
            }
        } catch (...) {}
    }

    if (modified) {
        std::string new_content = utf16_to_utf8(wcontent);
        if (has_bom) {
            std::string bom_content;
            unsigned char bom[3] = {0xEF, 0xBB, 0xBF};
            bom_content.append((char*)bom, 3);
            bom_content.append(new_content);
            write_file_w(filepath, bom_content);
        } else {
            write_file_w(filepath, new_content);
        }
        std::wcout << L"Fixed: " << filepath << std::endl;
    }
}

int main(int argc, char* argv[]) {
    _setmode(_fileno(stdout), _O_U16TEXT);

    std::wstring dir_name = L"chapters";
    if (argc > 1) dir_name = utf8_to_utf16(argv[1]);

    std::wstring search_path = dir_name + L"\\*.txt";
    WIN32_FIND_DATAW find_data;
    HANDLE h_find = FindFirstFileW(search_path.c_str(), &find_data);

    if (h_find == INVALID_HANDLE_VALUE) {
        std::wcerr << L"No files found." << std::endl;
        return 1;
    }

    std::wcout << L"Scanning directory: " << dir_name << std::endl;
    do {
        if (!(find_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) {
            process_file(dir_name + L"\\" + find_data.cFileName);
        }
    } while (FindNextFileW(h_find, &find_data));

    FindClose(h_find);
    std::wcout << L"Cleanup finished." << std::endl;
    return 0;
}
