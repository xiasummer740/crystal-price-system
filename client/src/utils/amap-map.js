/**
 * 高德地图 JS API 封装
 * 当用户填写了高德 Key 时使用，替换 Leaflet
 */

let AMap = null; // 高德 JS API 全局对象
let _amapLoading = null; // 缓存加载 Promise，避免重复创建 script 标签

// 动态加载高德脚本（返回缓存的 Promise，重复调用不重复加载）
export function loadAmapScript(key) {
  if (_amapLoading) return _amapLoading;
  if (window.AMap) {
    AMap = window.AMap;
    return Promise.resolve();
  }
  _amapLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.MarkerClusterer,AMap.PlaceSearch,AMap.AutoComplete,AMap.Geolocation`;
    script.async = true;
    script.onload = () => {
      AMap = window.AMap;
      _amapLoading = null;
      resolve();
    };
    script.onerror = () => {
      _amapLoading = null;
      reject(new Error("高德地图 JS API 加载失败，请检查网络"));
    };
    document.head.appendChild(script);
  });
  return _amapLoading;
}

// 创建地图（性能优化版：关掉耗资源的3D建筑和倾斜旋转）
export function createAmapMap(container, center = [114.3, 30.5], zoom = 6) {
  if (!AMap) throw new Error("高德 API 未加载");
  const map = new AMap.Map(container, {
    center: [center[1], center[0]], // Amap 用 [lng, lat]
    zoom,
    mapStyle: "amap://styles/light", // 浅色标准地图
    features: ["bg", "road", "point"], // 去掉"building"（3D建筑GPU杀手）
    viewMode: '2D',              // 纯2D渲染，最流畅
    scrollWheel: true,           // 启用鼠标滚轮缩放（显式设定，避免某些环境默认不生效）
    pitchEnable: false,           // 禁止倾斜
    rotateEnable: false,          // 禁止旋转
    animateEnable: false,         // 关闭动画减少重绘
  });
  return map;
}

// 销毁地图
export function destroyAmapMap(map) {
  if (map) map.destroy();
}

// 设置视图
export function setAmapView(map, lat, lng, zoom = 15) {
  map.setZoomAndCenter(zoom, [lng, lat]);
}

// 添加标记
export function addAmapMarker(map, lat, lng, opts = {}) {
  const marker = new AMap.Marker({
    position: [lng, lat],
    offset: new AMap.Pixel(-12, -12),
    ...opts,
  });
  map.add(marker);
  return marker;
}

// 添加带文字标签的标记（如 📍 搜索标记）
export function addAmapLabelMarker(map, lat, lng, label = "", onClick) {
  const el = document.createElement("div");
  el.className = "marker-pin is-icon";
  el.textContent = label || "⭐";
  const marker = new AMap.Marker({
    position: [lng, lat],
    content: el,
    offset: new AMap.Pixel(-10, -10),
    zIndex: 10,
  });
  map.add(marker);
  if (onClick) marker.on("click", onClick);
  return marker;
}

// 添加客户星标（显示 ⭐ + 公司名）
export function addAmapCustomerMarker(map, lat, lng, name = "", onClick) {
  const el = document.createElement("div");
  el.className = "marker-pin is-customer";
  if (name) {
    el.innerHTML = `<span class="mi">⭐</span><span class="mn">${name}</span>`;
    el.title = name;
  } else {
    el.textContent = "⭐";
  }
  const marker = new AMap.Marker({
    position: [lng, lat],
    content: el,
    offset: new AMap.Pixel(-10, -16),
    zIndex: 10,
  });
  map.add(marker);
  if (onClick) marker.on("click", onClick);
  return marker;
}

// 绑定信息窗
export function bindAmapPopup(marker, html) {
  const info = new AMap.InfoWindow({
    content: html,
    offset: new AMap.Pixel(0, -30),
  });
  marker.on("click", () => info.open(marker.getMap(), marker.getPosition()));
  return info;
}

// 批量添加标记到聚合
export function addAmapCluster(map, markers) {
  const cluster = new AMap.MarkerClusterer(map, markers, {
    gridSize: 60,
    minClusterSize: 2,
    zoomOnClick: true,
  });
  return cluster;
}

// 清除额外标记（搜索标记等）
export function clearAmapExtraMarkers(map, extraMarkers) {
  if (extraMarkers && extraMarkers.length) {
    map.remove(extraMarkers);
    extraMarkers.length = 0;
  }
}

// 导航路线
export function addAmapRoute(map, startLat, startLng, endLat, endLng) {
  return new Promise((resolve) => {
    AMap.plugin("AMap.Driving", () => {
      const driving = new AMap.Driving({
        map,
        policy: AMap.DrivingPolicy.LEAST_TIME,
      });
      driving.search(
        new AMap.LngLat(startLng, startLat),
        new AMap.LngLat(endLng, endLat),
        (status, result) => {
          if (status === "complete") {
            const plan = result.routes?.[0];
            const dist = plan ? (plan.distance / 1000).toFixed(1) + " km" : "";
            const time = plan ? Math.round(plan.time / 60) + "min" : "";
            resolve({ distance: dist, time });
          } else {
            resolve(null);
          }
        },
      );
    });
  });
}

// 自动补全（AMap.AutoComplete，输入时弹出建议列表）
export function searchAmapTips(keywords, callback, city = "440300") {
  if (!AMap) return callback([]);
  if (!keywords || keywords.length < 2) return callback([]);
  AMap.plugin("AMap.AutoComplete", () => {
    const auto = new AMap.AutoComplete({
      city: city, // 默认深圳宝安区，避免跨省干扰
      citylimit: true,
      datatype: "all",
    });
    auto.search(keywords, (status, result) => {
      if (status === "complete" && result.tips) {
        const list = result.tips
          .filter((t) => t.name)
          .map((t) => ({
            name: t.name,
            address: t.district || "",
            lat: t.location?.lat,
            lng: t.location?.lng,
            district: t.district || "",
            adcode: t.adcode || "",
          }));
        callback(list);
      } else {
        callback([]);
      }
    });
  });
}

// 点击选点（返回 WGS84 坐标）
// 地点搜索（浏览器端直接用高德 PlaceSearch，不走服务器，快且准）
export function searchAmapPoi(keywords, callback) {
  if (!AMap) return callback([]);
  AMap.plugin("AMap.PlaceSearch", () => {
    const placeSearch = new AMap.PlaceSearch({
      pageSize: 10,
      pageIndex: 1,
      citylimit: false,
      type: "全部",
    });
    placeSearch.search(keywords, (status, result) => {
      if (status === "complete" && result.poiList?.pois) {
        const list = result.poiList.pois.map((p) => ({
          name: p.name || "",
          address: p.pname + p.cityname + p.adname + (p.address || ""),
          lat: p.location.lat,
          lng: p.location.lng,
          city: p.cityname || "",
          district: p.adname || "",
          province: p.pname || "",
          type: p.type || "",
          business: p.businessArea || "",
          provider: "amap-poi",
        }));
        callback(list);
      } else {
        // POI 无结果 → 降级地理编码
        AMap.plugin("AMap.Geocoder", () => {
          const geocoder = new AMap.Geocoder({ city: "", radius: 1000 });
          geocoder.getLocation(keywords, (status2, result2) => {
            if (status2 === "complete" && result2.geocodes?.length) {
              const list = result2.geocodes.map((g) => ({
                name: g.formattedAddress || keywords,
                address: g.formattedAddress || "",
                lat: g.location.lat,
                lng: g.location.lng,
                city: g.city || "",
                district: g.district || "",
                province: g.province || "",
                type: "geocode",
                provider: "amap-geo",
              }));
              callback(list);
            } else callback([]);
          });
        });
      }
    });
  });
}

export function onAmapClickForPick(map, callback) {
  map.on("click", (e) => {
    // Amap 返回 GCJ02，转 WGS84 存库
    const gcj = { lat: e.latlng.lat, lng: e.latlng.lng };
    const wgs = gcj02ToWgs84(gcj.lat, gcj.lng);
    callback(wgs.lat, wgs.lng, gcj.lat, gcj.lng);
  });
}

// GCJ02 → WGS84（复用的转换函数）
const _a = 6378245.0;
const _ee = 0.00669342162296594323;
function _transformLat(x, y) {
  let ret =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret +=
    ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret +=
    ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) *
      2) /
    3;
  return ret;
}
function _transformLon(x, y) {
  let ret =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret +=
    ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret +=
    ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) *
      2) /
    3;
  return ret;
}
function _inChina(lat, lng) {
  return lng > 72 && lng < 137 && lat > 1 && lat < 55;
}
function gcj02ToWgs84(lat, lng) {
  if (!_inChina(lat, lng)) return { lat, lng };
  const wgs = _wgs84ToGcj02(lat, lng);
  return { lat: 2 * lat - wgs.lat, lng: 2 * lng - wgs.lng };
}
function _wgs84ToGcj02(lat, lng) {
  if (!_inChina(lat, lng)) return { lat, lng };
  let dLat = _transformLat(lng - 105, lat - 35);
  let dLng = _transformLon(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - _ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((_a * (1 - _ee)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((_a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

export default {
  loadAmapScript,
  createAmapMap,
  destroyAmapMap,
  setAmapView,
  addAmapMarker,
  addAmapLabelMarker,
  addAmapCustomerMarker,
  bindAmapPopup,
  addAmapCluster,
  clearAmapExtraMarkers,
  addAmapRoute,
  onAmapClickForPick,
  searchAmapTips,
};
