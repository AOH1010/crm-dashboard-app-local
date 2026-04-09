import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  MapPinned,
  PieChart as PieIcon,
  Info,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { fetchLeads, type LeadsResponse } from "@/src/lib/leadsApi";
import { LOAD_LIVE_DATA_EVENT } from "@/src/lib/liveDataEvents";
import { readViewCache, writeViewCache } from "@/src/lib/viewCache";

type LeadsMode = "customers" | "leads";
type ProvinceGeometry = { type?: string; coordinates?: unknown };
type ProvinceFeature = { type?: string; id?: string | number; properties?: { Ten?: string }; geometry?: ProvinceGeometry };
type ProvinceFeatureCollection = { type?: string; features?: ProvinceFeature[]; [key: string]: unknown };

const GEO_URL = "/vn-provinces.json";
const INDUSTRY_COLORS = ["#B8FF68", "#7ED343", "#3C6600", "#1C1D21", "#6B7280", "#E5E7EB"];
const HEAT_COLORS = ["#EEF7E0", "#DAF0B8", "#C3E889", "#A8DD57", "#86CC38", "#60AC23", "#3F7F10", "#295408"];
const LEADS_CACHE_KEY = "crm_cache_leads";

function foldText(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[đĐ]/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeProvinceKey(value: string) {
  const folded = foldText(value).replace(/\./g, " ");
  let normalized = folded;
  if (normalized.startsWith("tinh ")) {
    normalized = normalized.slice(5);
  } else if (normalized.startsWith("thanh pho ")) {
    normalized = normalized.slice(10);
  } else if (normalized.startsWith("tp ")) {
    normalized = normalized.slice(3);
  }
  return normalized.replace(/[^a-z0-9]/g, "");
}

function stripProvincePrefix(value: string) {
  return value
    .replace(/^\s*(Tỉnh|tỉnh|THÀNH PHỐ|Thành phố|thành phố|TP\.?|Tp\.?|tp\.?)\s+/u, "")
    .replace(/\s*-\s*/g, " - ")
    .trim();
}

function extractGeometryPoints(geometry: { type?: string; coordinates?: unknown }) {
  const points: Array<[number, number]> = [];
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return points;
  }

  const walk = (node: unknown) => {
    if (!Array.isArray(node)) {
      return;
    }
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      points.push([node[0], node[1]]);
      return;
    }
    for (const item of node) {
      walk(item);
    }
  };

  walk(geometry.coordinates);
  return points;
}

function computeGeometryCenter(geometry: { type?: string; coordinates?: unknown }) {
  const points = extractGeometryPoints(geometry);
  if (points.length === 0) {
    return null;
  }

  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }

  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2] as [number, number];
}

function computeBounds(points: Array<[number, number]>) {
  if (points.length === 0) {
    return null;
  }

  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLon, minLat, maxLon, maxLat };
}

function polygonBounds(polygon: unknown) {
  const points = extractGeometryPoints({ coordinates: polygon });
  return computeBounds(points);
}

function keepPolygonInMainlandView(polygon: unknown) {
  const bounds = polygonBounds(polygon);
  if (!bounds) {
    return false;
  }

  // Remove far-east offshore islands (Hoàng Sa/Trường Sa clusters) from the visual map.
  return bounds.minLon <= 110.2;
}

function sanitizeProvinceGeometry(geometry: ProvinceGeometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return keepPolygonInMainlandView(geometry.coordinates) ? geometry : null;
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    const kept = geometry.coordinates.filter((polygon) => keepPolygonInMainlandView(polygon));
    if (kept.length === 0) {
      return null;
    }
    return { ...geometry, coordinates: kept };
  }

  return geometry;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getHeatColor(value: number, thresholds: number[]) {
  if (value <= 0 || thresholds.length === 0) {
    return "#EEF1F4";
  }

  for (let index = 0; index < thresholds.length; index += 1) {
    if (value <= thresholds[index]) {
      return HEAT_COLORS[index] || HEAT_COLORS[HEAT_COLORS.length - 1];
    }
  }
  return HEAT_COLORS[HEAT_COLORS.length - 1];
}

export default function LeadsView() {
  const [mode, setMode] = useState<LeadsMode>("customers");
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cacheSavedAt, setCacheSavedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapGeoJson, setMapGeoJson] = useState<ProvinceFeatureCollection | null>(null);
  const [provinceNamesByKey, setProvinceNamesByKey] = useState<Record<string, string>>({});
  const [provinceCenterByKey, setProvinceCenterByKey] = useState<Record<string, [number, number]>>({});
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    provinceName: string;
    count: number;
  } | null>(null);
  const [hoveredIndustry, setHoveredIndustry] = useState<{ name: string; value: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const topProvincePanelRef = useRef<HTMLDivElement | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const cached = readViewCache<LeadsResponse>(LEADS_CACHE_KEY);
    if (cached) {
      setData(cached.data);
      setCacheSavedAt(cached.savedAt);
    }
  }, []);

  const handleRefreshNow = async () => {
    setIsRefreshing(true);
    try {
      const payload = await fetchLeads();
      const cached = writeViewCache(LEADS_CACHE_KEY, payload);
      setData(payload);
      setCacheSavedAt(cached.savedAt);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load leads data.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const onLoadLiveData = () => {
      void handleRefreshNow();
    };

    window.addEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    return () => {
      window.removeEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMapNames() {
      try {
        const response = await fetch(GEO_URL);
        if (!response.ok) {
          throw new Error("Failed to load Vietnam map data.");
        }
        const geo = (await response.json()) as ProvinceFeatureCollection;
        const sourceFeatures = Array.isArray(geo.features) ? geo.features : [];
        const sanitizedFeatures = sourceFeatures
          .map((feature) => {
            const sanitizedGeometry = sanitizeProvinceGeometry(feature.geometry || {});
            if (!sanitizedGeometry) {
              return null;
            }
            return { ...feature, geometry: sanitizedGeometry };
          })
          .filter((feature): feature is ProvinceFeature & { geometry: ProvinceGeometry } => feature !== null);
        const sanitizedGeo: ProvinceFeatureCollection = { ...geo, features: sanitizedFeatures };

        const entries = sanitizedFeatures
          .map((feature) => {
            const ten = String(feature.properties?.Ten || "");
            const displayName = stripProvincePrefix(ten);
            const key = normalizeProvinceKey(displayName);
            const center = computeGeometryCenter(feature.geometry || {});
            return { key, displayName, center };
          })
          .filter((item) => item.key.length > 0 && item.displayName.length > 0);

        if (!cancelled) {
          setMapGeoJson(sanitizedGeo);
          setProvinceNamesByKey(Object.fromEntries(entries.map((item: { key: string; displayName: string }) => [item.key, item.displayName])));
          setProvinceCenterByKey(Object.fromEntries(
            entries
              .filter((item: { key: string; center: [number, number] | null }) => Array.isArray(item.center))
              .map((item: { key: string; center: [number, number] | null }) => [item.key, item.center as [number, number]]),
          ));
        }
      } catch {
        if (!cancelled) {
          setMapGeoJson(null);
          setProvinceNamesByKey({});
          setProvinceCenterByKey({});
        }
      }
    }

    void loadMapNames();
    return () => {
      cancelled = true;
    };
  }, []);

  const provinceCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.map.province_counts || []) {
      map.set(item.province_key, mode === "customers" ? item.customer_count : item.lead_count);
    }
    return map;
  }, [data?.map.province_counts, mode]);

  const heatThresholds = useMemo(() => {
    const positiveValues = Array.from(provinceCountMap.values())
      .filter((value) => value > 0)
      .sort((left, right) => left - right);
    if (positiveValues.length === 0) {
      return [];
    }

    const quantiles = [0.12, 0.26, 0.4, 0.55, 0.7, 0.84, 0.94];
    return quantiles.map((quantile) => {
      const index = Math.min(
        positiveValues.length - 1,
        Math.max(0, Math.round((positiveValues.length - 1) * quantile)),
      );
      return positiveValues[index];
    });
  }, [provinceCountMap]);

  const topProvinces = useMemo(() => {
    const raw = mode === "customers" ? data?.map.top_provinces.customers : data?.map.top_provinces.leads;
    return (raw || []).map((item) => ({
      provinceKey: item.province_key,
      provinceName: provinceNamesByKey[item.province_key] || item.province_key,
      count: mode === "customers" ? item.customer_count : item.lead_count,
    }));
  }, [data?.map.top_provinces.customers, data?.map.top_provinces.leads, mode, provinceNamesByKey]);
  const topTwoProvinces = topProvinces.slice(0, 2);
  const highlightedProvinceColorByKey = useMemo(() => {
    const highlighted: Record<string, string> = {};
    if (topProvinces[0]?.provinceKey) {
      highlighted[topProvinces[0].provinceKey] = "#204907";
    }
    if (topProvinces[1]?.provinceKey) {
      highlighted[topProvinces[1].provinceKey] = "#3A730D";
    }
    return highlighted;
  }, [topProvinces]);

  const industryChartData = useMemo(() => {
    const prepared = (data?.industry_mix || [])
      .map((item) => ({
        name: item.name === "Unknown" ? "Unknown" : item.name,
        value: mode === "customers" ? item.customer_count : item.lead_count,
      }))
      .filter((item) => item.value > 0)
      .sort((left, right) => right.value - left.value);

    const top = prepared.slice(0, 5);
    const restValue = prepared.slice(5).reduce((sum, item) => sum + item.value, 0);
    const combined = restValue > 0 ? [...top, { name: "Other", value: restValue }] : top;

    return combined.map((item, index) => ({
      ...item,
      color: INDUSTRY_COLORS[index % INDUSTRY_COLORS.length],
    }));
  }, [data?.industry_mix, mode]);

  const industryTotal = mode === "customers"
    ? (data?.summary.total_customers || 0)
    : (data?.summary.total_leads || 0);

  const segmentRows = useMemo(() => data?.segment_conversion || [], [data?.segment_conversion]);

  const updateHoverTooltip = (
    event: React.MouseEvent<SVGPathElement, MouseEvent>,
    provinceName: string,
    count: number,
  ) => {
    const mapRect = mapContainerRef.current?.getBoundingClientRect();
    if (!mapRect) {
      return;
    }
    const panelRect = topProvincePanelRef.current?.getBoundingClientRect();

    const tooltipWidth = 176;
    const tooltipHeight = 38;

    let x = event.clientX - mapRect.left + 16;
    let y = event.clientY - mapRect.top + 14;

    const minX = 10;
    const minY = 10;
    const maxX = mapRect.width - tooltipWidth - 10;
    const maxY = mapRect.height - tooltipHeight - 10;
    x = Math.max(minX, Math.min(x, maxX));
    y = Math.max(minY, Math.min(y, maxY));

    if (panelRect) {
      const panelLeft = panelRect.left - mapRect.left;
      const panelRight = panelRect.right - mapRect.left;
      const panelTop = panelRect.top - mapRect.top;
      const panelBottom = panelRect.bottom - mapRect.top;

      if (
        x + tooltipWidth > panelLeft
        && x < panelRight
        && y + tooltipHeight > panelTop
        && y < panelBottom
      ) {
        x = panelLeft - tooltipWidth - 8;
        x = Math.max(minX, Math.min(x, maxX));
      }
    }

    setHoverInfo({ x, y, provinceName, count });
  };

  return (
    <div className="animate-in slide-in-from-bottom-2 space-y-8 duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-[#1C1D21]">
            Leads Distribution
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Vietnam heatmap by province with customer conversion insights by industry and segment group.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-ambient">
        {cacheSavedAt ? (
          <span>
            Dang hien cache luu luc <strong>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(cacheSavedAt))}</strong>.
            {" "}
            Bam <strong>Load live data</strong> tren top bar khi ban muon danh thuc backend va cap nhat so moi.
          </span>
        ) : (
          <span>
            Chua co cache local cho man Leads. Bam <strong>Load live data</strong> tren top bar de lay snapshot moi tu server.
          </span>
        )}
      </section>

      {errorMessage ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
          {errorMessage}
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.8fr_1fr]">
        <section className="relative flex min-h-[760px] flex-col gap-5 rounded-[30px] border border-gray-100 bg-white p-6 shadow-ambient">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-headline text-[length:var(--font-size-h-bento)] font-bold tracking-tight text-[#1C1D21]">
                Vietnam Heatmap
              </h3>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Hover a province to view exact count
              </p>
            </div>

            <div className="inline-flex rounded-full border border-gray-200 bg-[#F6F6F8] p-1">
              {(["customers", "leads"] as LeadsMode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => startTransition(() => setMode(item))}
                  className={cn(
                    "rounded-full px-5 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
                    mode === item ? "bg-[#1C1D21] text-[#B8FF68]" : "text-gray-500 hover:text-[#1C1D21]",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div ref={mapContainerRef} className="relative flex-1 overflow-hidden rounded-[24px] border border-gray-100 bg-[#F9F9FB]">
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ scale: 2020, center: [106.3, 16.35] }}
              style={{ width: "100%", height: "100%" }}
              className="outline-none"
            >
              <ZoomableGroup
                zoom={1}
                center={[106.5, 16.5]}
                filterZoomEvent={(event) => event.type !== "wheel"}
              >
                {mapGeoJson ? (
                  <Geographies geography={mapGeoJson}>
                    {({ geographies }) => geographies.map((geo) => {
                      const ten = String(geo.properties?.Ten || "");
                      const provinceName = stripProvincePrefix(ten);
                      const provinceKey = normalizeProvinceKey(provinceName);
                      const count = provinceCountMap.get(provinceKey) || 0;
                      const heatColor = highlightedProvinceColorByKey[provinceKey] || getHeatColor(count, heatThresholds);

                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={heatColor}
                          stroke="#FFFFFF"
                          strokeWidth={0.7}
                          onMouseMove={(event) => updateHoverTooltip(event, provinceName, count)}
                          onMouseLeave={() => setHoverInfo(null)}
                          style={{
                            default: { outline: "none" },
                            hover: { fill: heatColor, outline: "none", opacity: 0.88 },
                            pressed: { outline: "none" },
                          }}
                        />
                      );
                    })}
                  </Geographies>
                ) : null}

                {topTwoProvinces.map((item, index) => {
                  const center = provinceCenterByKey[item.provinceKey];
                  if (!center) {
                    return null;
                  }

                  const label = `${item.provinceName} - ${formatNumber(item.count)}`;
                  const width = Math.max(92, label.length * 5.8 + 16);
                  const topLabelOffsets: Array<[number, number]> = [[42, -20], [-44, 14]];
                  const fallbackOffset: [number, number] = [center[0] > 107 ? -42 : 42, item.count > 0 ? -18 : 18];
                  const [offsetX, offsetY] = topLabelOffsets[index] || fallbackOffset;
                  const connectorX = offsetX > 0 ? offsetX - width / 2 + 8 : offsetX + width / 2 - 8;
                  const connectorY = offsetY;

                  return (
                    <Marker key={`top3-label-${item.provinceKey}`} coordinates={center}>
                      <g className="pointer-events-none">
                        <line
                          x1={0}
                          y1={0}
                          x2={connectorX}
                          y2={connectorY}
                          stroke="#1C1D21"
                          strokeOpacity={0.6}
                          strokeWidth={1.2}
                        />
                        <rect
                          x={offsetX - width / 2}
                          y={offsetY - 11}
                          width={width}
                          height={22}
                          rx={11}
                          fill="#1C1D21"
                          opacity={0.96}
                        />
                        <text
                          x={offsetX}
                          y={offsetY + 3.8}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.01em" }}
                        >
                          {label}
                        </text>
                      </g>
                    </Marker>
                  );
                })}
              </ZoomableGroup>
            </ComposableMap>

            <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-[11px] font-bold text-gray-500 shadow-ambient">
              Blank province excluded from map: {formatNumber(data?.summary.blank_province_count || 0)}
            </div>

            <div ref={topProvincePanelRef} className="absolute right-4 top-4 w-[250px] rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-ambient">
              <div className="mb-3 flex items-center gap-2">
                <MapPinned className="h-4 w-4 text-[#3c6600]" />
                <p className="text-xs font-black uppercase tracking-widest text-[#1C1D21]">Top 5 Provinces</p>
              </div>
              <div className="space-y-2.5">
                {topProvinces.map((item) => (
                  <div key={item.provinceName} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-[#1C1D21]">{item.provinceName}</span>
                    <span className="font-black text-[#3c6600]">{formatNumber(item.count)}</span>
                  </div>
                ))}
              </div>
            </div>

            {hoverInfo ? (
              <div
                className="pointer-events-none absolute z-[70] rounded-xl bg-[#1C1D21] px-3 py-2 text-xs font-bold text-white shadow-xl"
                style={{ left: hoverInfo.x, top: hoverInfo.y }}
              >
                {hoverInfo.provinceName} - {formatNumber(hoverInfo.count)}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="flex min-h-[680px] flex-col gap-8">
          <section className="rounded-[30px] border border-gray-100 bg-white p-6 shadow-ambient">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="font-headline text-[length:var(--font-size-h-bento)] font-bold tracking-tight text-[#1C1D21]">
                  Industry Mix
                </h3>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Based on {mode}
                </p>
              </div>
              <div className="rounded-xl bg-[#F6F6F8] p-2">
                <PieIcon className="h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="relative h-[290px] w-[58%] min-w-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={industryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={108}
                      dataKey="value"
                      paddingAngle={5}
                      stroke="none"
                      onMouseEnter={(_, index) => setHoveredIndustry(industryChartData[index] || null)}
                      onMouseLeave={() => setHoveredIndustry(null)}
                    >
                      {industryChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center">
                    <span className="font-headline text-4xl font-black text-[#1C1D21]">{formatNumber(industryTotal)}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{mode}</span>
                  </div>
                </div>
              </div>

              <div className="w-[42%] min-w-[180px] space-y-2">
                <div className="rounded-xl border border-gray-200 bg-[#F9F9FB] p-3 text-xs">
                  <p className="font-black uppercase tracking-widest text-gray-400">Hover Detail</p>
                  <p className="mt-1 font-semibold text-[#1C1D21]">
                    {hoveredIndustry ? `${hoveredIndustry.name} - ${formatNumber(hoveredIndustry.value)}` : "Hover a slice"}
                  </p>
                </div>

                <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1 custom-scrollbar">
                  {industryChartData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-semibold text-gray-600">{item.name}</span>
                      <span className="ml-auto font-black text-[#1C1D21]">
                        {formatPercent(industryTotal > 0 ? (item.value / industryTotal) * 100 : 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-1 flex-col rounded-[30px] border border-gray-100 bg-white p-6 shadow-ambient">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-headline text-[length:var(--font-size-h-bento)] font-bold tracking-tight text-[#1C1D21]">
                  Segment Conversion
                </h3>
                <Info className="h-3.5 w-3.5 text-gray-300" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                customers / leads
              </span>
            </div>

            <div className="custom-scrollbar max-h-[330px] space-y-5 overflow-y-auto pr-1">
              {segmentRows.map((segment) => (
                <div key={segment.segment_group}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#1C1D21]">{segment.segment_group}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-black text-[#3c6600]">{formatPercent(segment.conversion_rate)}</span>
                      <span className="font-semibold text-gray-400">
                        {formatNumber(segment.customer_count)}/{formatNumber(segment.lead_count)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-[#F1F3F5]">
                    <div
                      className="h-full rounded-full bg-[#B8FF68] transition-all duration-700"
                      style={{ width: `${Math.min(segment.conversion_rate, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

    </div>
  );
}
