p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('map.setView([gj.lng, gj.lat], 15);','mapSetView(gj.lat, gj.lng, 15);')
s=s.replace('''  try {
    const r = await myReverseGeocode(lat, lng);
    const addr = r?.data?.address || '';''','''  try {
    // 高德逆地理要求 GCJ02；没有 Key 走 Nominatim 时用 WGS84
    const g = getAmapKey() ? wgs84ToGcj02(lat, lng) : { lat, lng };
    const r = await myReverseGeocode(g.lat, g.lng);
    const addr = r?.data?.address || '';''')
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
