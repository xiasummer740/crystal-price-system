# 启动脚本说明

## scripts/startup/

| 文件 | 作用 |
|------|------|
| `启动晶振系统.vbs` | 静默启动晶振主程序（放到 Windows 启动文件夹即可开机自启） |

**配置开机自启**：
1. Win + R → 输入 `shell:startup` → 回车
2. 把 `启动晶振系统.vbs` 复制（或创建快捷方式）到打开的文件夹

## scripts/tunnel/

Cloudflare Tunnel 服务管理。**详细教程见 [docs/外网访问教程.md](../docs/外网访问教程.md)**。

| 文件 | 作用 | 运行方式 |
|------|------|---------|
| `install-service.bat` | 把 cloudflared 安装为开机自启 Windows 服务 | 管理员右键运行 |
| `uninstall-service.bat` | 卸载 cloudflared 服务 | 管理员右键运行 |
| `check-status.bat` | 查看服务状态 + 最近日志 | 双击即可 |

**注意**：
- 这套脚本需要 `D:\software\cloudflared\cloudflared.exe` 存在
- 下载 cloudflared：https://github.com/cloudflare/cloudflared/releases/latest
- 安装时需要 Tunnel Token（去 Cloudflare 后台拿，教程里有详细步骤）
