# 高德地图 API 凭证

> 项目: crystal-price-system (晶振报价管理系统)

## Key 信息

- **Key**: `04affc3514a83e82dddd771927c44c7c`
- **安全密钥 (jscode)**: `3c142aa258d4c574d410905e198ee8f0`
- **应用平台**: Web端(JS API)
- **存储位置**: 系统设置页 → 高德地图 Key / 安全密钥

## 使用方式

用户在设置页手动填写，前端通过 `localStorage` 读取：
- `localStorage.getItem('crystal_amap_key')`
- `localStorage.getItem('crystal_amap_jscode')`

## 备注

该 Key 用于：
- 地图瓦片加载（`webapi.amap.com/maps?v=2.0`）
- POI 搜索（`AMap.PlaceSearch`）
- 自动补全（`AMap.AutoComplete`）
- 地理编码/逆地理编码（服务端 API）
