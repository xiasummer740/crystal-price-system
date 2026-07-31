# 接力文档 v1.0.203

> 修复升级慢/失败问题 — 补传 .blockmap 恢复差分更新 + 下载断点续传，最新 tag: v1.0.203

## 当前状态

当前版本 **v1.0.203**，已发布到 GitHub Release（含 exe + **blockmap** + latest.yml 三件套）。

```
main @ ede02a5 — chore: update latest.yml to v1.0.203
```

## 问题根因

**v1.0.202 手动发版漏传 `.blockmap` 文件** → electron-updater 无法做差分更新 → 升级退化为**全量下载 114MB**（~3分钟 @667KB/s）→ 慢 + 连接一停就失败。

之前升级快是因为 release 带 `.blockmap`，electron-updater 走差分（只下载版本间差异的几 MB）。

## 修复（v1.0.203）

1. **发版带 .blockmap**：GitHub Release 三件套 `exe + exe.blockmap + latest.yml`，恢复差分更新
2. **`electron/updater.js` 断点续传**：`downloadWithRetry` 支持 HTTP Range 续传（重试从已下载位置继续），传 expectedSize 并做最终大小校验，超时放宽到 600s
3. **补传 blockmap 到 v1.0.202**（历史 release 资产补齐）

## 已验证

- ✅ 断点续传实测：3MB 部分文件 + Range → 206 → 续传至完整 119792215 字节
- ✅ v1.0.203 release 三件套可下载（302 可访问）
- ✅ 打包版启动正常 + updater 加载正常
- ✅ GitHub/CDN 支持 Range（206）

## 踩坑

- **发版必须传 3 件套**（详见记忆 `release-blockmap-pitfall.md`）
- **打包失败 `d3dcompiler_47.dll Access denied`**：残留 Electron 进程锁文件 → 强杀所有 `晶振报价管理系统.exe`/`electron.exe` 后删除 win-unpacked 重打
- 测试中发现有 4 个残留 Electron 实例同时运行（端口冲突源头）

## 下一步

- 祥哥验证 v1.0.203 升级速度（应几秒完成）
- 客户物料看板视图（待定）

相关记忆：[[release-blockmap-pitfall]] [[auto-update-evolution]] [[electron-upgrade-guide]]
