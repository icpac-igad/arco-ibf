import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { GripVertical } from "lucide-react";

const TILE_LAYERS: Record<string, { url: string; attribution: string; maxZoom: number }> = {
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "&copy; Esri", maxZoom: 19 },
  dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: "&copy; CARTO", maxZoom: 19 },
  terrain: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenTopoMap", maxZoom: 17 },
  streets: { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", attribution: "&copy; CARTO", maxZoom: 19 },
  light: { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "&copy; CARTO", maxZoom: 19 },
};

function createMap(el: HTMLElement, center: [number, number], zoom: number, tileKey: string, interactive: boolean): L.Map {
  const tile = TILE_LAYERS[tileKey] || TILE_LAYERS.satellite;
  const map = L.map(el, {
    zoomControl: false, attributionControl: false,
    scrollWheelZoom: interactive, dragging: interactive, touchZoom: interactive,
    doubleClickZoom: interactive, boxZoom: false, keyboard: false,
  }).setView(center, zoom);
  L.tileLayer(tile.url, { maxZoom: tile.maxZoom }).addTo(map);
  L.control.attribution({ position: "bottomleft", prefix: false }).addAttribution(tile.attribution).addTo(map);
  return map;
}

interface CompareMapProps {
  center: [number, number];
  zoom: number;
  leftLayer: string;
  rightLayer: string;
  leftLabel?: string;
  rightLabel?: string;
  height?: string;
  interactive?: boolean;
}

export function CompareMap({ center, zoom, leftLayer, rightLayer, leftLabel, rightLabel, height = "500px", interactive = true }: CompareMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftMapRef = useRef<HTMLDivElement>(null);
  const rightMapRef = useRef<HTMLDivElement>(null);
  const leftMapInstance = useRef<L.Map | null>(null);
  const rightMapInstance = useRef<L.Map | null>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const isDragging = useRef(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!leftMapRef.current || !rightMapRef.current) return;

    leftMapInstance.current = createMap(leftMapRef.current, center, zoom, leftLayer, interactive);
    rightMapInstance.current = createMap(rightMapRef.current, center, zoom, rightLayer, interactive);

    const lMap = leftMapInstance.current;
    const rMap = rightMapInstance.current;

    const syncMaps = (source: L.Map, target: L.Map) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      target.setView(source.getCenter(), source.getZoom(), { animate: false });
      syncingRef.current = false;
    };

    lMap.on("moveend", () => syncMaps(lMap, rMap));
    rMap.on("moveend", () => syncMaps(rMap, lMap));

    const ro = new ResizeObserver(() => {
      lMap.invalidateSize();
      rMap.invalidateSize();
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      lMap.remove();
      rMap.remove();
      leftMapInstance.current = null;
      rightMapInstance.current = null;
    };
  }, [center, zoom, leftLayer, rightLayer, interactive]);

  const handlePointerDown = useCallback(() => { isDragging.current = true; }, []);
  const handlePointerUp = useCallback(() => { isDragging.current = false; }, []);
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(5, Math.min(95, x)));
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-hidden select-none"
      style={{ height }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      data-testid="compare-map"
    >
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
        <div ref={leftMapRef} className="w-full h-full" />
      </div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}>
        <div ref={rightMapRef} className="w-full h-full" />
      </div>
      <div
        className="absolute top-0 bottom-0 z-[1000] cursor-col-resize flex items-center"
        style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
        onPointerDown={handlePointerDown}
        data-testid="compare-slider"
      >
        <div className="w-1 h-full bg-white/80 shadow-lg" />
        <div className="absolute top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-xl flex items-center justify-center cursor-grab active:cursor-grabbing">
          <GripVertical className="w-5 h-5 text-gray-700" />
        </div>
      </div>
      {leftLabel && (
        <div className="absolute top-3 left-3 z-[1001] bg-icpac-green-700/90 backdrop-blur px-3 py-1.5 rounded-md text-xs font-semibold text-white" data-testid="compare-left-label">
          {leftLabel}
        </div>
      )}
      {rightLabel && (
        <div className="absolute top-3 right-3 z-[1001] bg-icpac-green-700/90 backdrop-blur px-3 py-1.5 rounded-md text-xs font-semibold text-white" data-testid="compare-right-label">
          {rightLabel}
        </div>
      )}
    </div>
  );
}

interface SplitMapProps {
  center: [number, number];
  zoom: number;
  leftLayer: string;
  rightLayer: string;
  leftLabel?: string;
  rightLabel?: string;
  height?: string;
  interactive?: boolean;
}

export function SplitMap({ center, zoom, leftLayer, rightLayer, leftLabel, rightLabel, height = "500px", interactive = true }: SplitMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftMapRef = useRef<HTMLDivElement>(null);
  const rightMapRef = useRef<HTMLDivElement>(null);
  const leftMapInstance = useRef<L.Map | null>(null);
  const rightMapInstance = useRef<L.Map | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!leftMapRef.current || !rightMapRef.current) return;

    leftMapInstance.current = createMap(leftMapRef.current, center, zoom, leftLayer, interactive);
    rightMapInstance.current = createMap(rightMapRef.current, center, zoom, rightLayer, interactive);

    const lMap = leftMapInstance.current;
    const rMap = rightMapInstance.current;

    const syncMaps = (source: L.Map, target: L.Map) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      target.setView(source.getCenter(), source.getZoom(), { animate: false });
      syncingRef.current = false;
    };

    lMap.on("moveend", () => syncMaps(lMap, rMap));
    rMap.on("moveend", () => syncMaps(rMap, lMap));

    const ro = new ResizeObserver(() => {
      lMap.invalidateSize();
      rMap.invalidateSize();
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      lMap.remove();
      rMap.remove();
      leftMapInstance.current = null;
      rightMapInstance.current = null;
    };
  }, [center, zoom, leftLayer, rightLayer, interactive]);

  return (
    <div ref={containerRef} className="w-full rounded-lg overflow-hidden" style={{ height }} data-testid="split-map">
      <div className="grid grid-cols-2 h-full gap-[2px] bg-gray-800">
        <div className="relative">
          <div ref={leftMapRef} className="w-full h-full" />
          {leftLabel && (
            <div className="absolute top-3 left-3 z-[1001] bg-icpac-green-700/90 backdrop-blur px-3 py-1.5 rounded-md text-xs font-semibold text-white" data-testid="split-left-label">
              {leftLabel}
            </div>
          )}
        </div>
        <div className="relative">
          <div ref={rightMapRef} className="w-full h-full" />
          {rightLabel && (
            <div className="absolute top-3 right-3 z-[1001] bg-icpac-green-700/90 backdrop-blur px-3 py-1.5 rounded-md text-xs font-semibold text-white" data-testid="split-right-label">
              {rightLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
