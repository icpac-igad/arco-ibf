import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import L from "leaflet";
import { Layers } from "lucide-react";

export type SeverityLevel = "extreme" | "severe" | "high" | "moderate";

export interface ChapterData {
  center: [number, number];
  zoom: number;
  datasetId?: string;
  layerId?: string;
  datetime?: string;
  severity?: SeverityLevel;
  markerLabel?: string;
}

export interface BasemapConfig {
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  extreme: "#dc2626",
  severe: "#ea580c",
  high: "#d97706",
  moderate: "#ca8a04",
};

export const DEFAULT_BASEMAPS: Record<string, BasemapConfig> = {
  satellite: { name: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: '&copy; <a href="https://www.esri.com/">Esri</a>', maxZoom: 19 },
  dark: { name: "Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: '&copy; <a href="https://carto.com/">CARTO</a>', maxZoom: 19 },
  terrain: { name: "Terrain", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>', maxZoom: 17 },
  streets: { name: "Streets", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", attribution: '&copy; <a href="https://carto.com/">CARTO</a>', maxZoom: 19 },
};

const StorylineContext = createContext<{ activeChapter: ChapterData | null; setActiveChapter: (c: ChapterData) => void }>({ activeChapter: null, setActiveChapter: () => {} });

interface StoryMapProps {
  center: [number, number];
  zoom: number;
  className?: string;
  markerLabel?: string;
  severity?: SeverityLevel;
  basemaps?: Record<string, BasemapConfig>;
  defaultBasemap?: string;
  interactive?: boolean;
  flyDuration?: number;
  markerRadius?: number;
}

export default function StoryMap({ center, zoom, className = "", markerLabel, severity = "high", basemaps = DEFAULT_BASEMAPS, defaultBasemap = "satellite", interactive = false, flyDuration = 1.8, markerRadius = 12 }: StoryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [activeBasemap, setActiveBasemap] = useState(defaultBasemap);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {
        zoomControl: false, attributionControl: false,
        scrollWheelZoom: interactive, dragging: interactive, touchZoom: interactive,
        doubleClickZoom: interactive, boxZoom: false, keyboard: false,
      }).setView(center, zoom);
      const bm = basemaps[activeBasemap];
      tileLayerRef.current = L.tileLayer(bm.url, { maxZoom: bm.maxZoom }).addTo(mapInstance.current);
      L.control.attribution({ position: "bottomright", prefix: false }).addAttribution(bm.attribution).addTo(mapInstance.current);
      setTimeout(() => setIsReady(true), 300);
    }
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, []);

  const switchBasemap = useCallback((key: string) => {
    if (!mapInstance.current || key === activeBasemap) return;
    const bm = basemaps[key];
    if (tileLayerRef.current) tileLayerRef.current.remove();
    tileLayerRef.current = L.tileLayer(bm.url, { maxZoom: bm.maxZoom }).addTo(mapInstance.current);
    setActiveBasemap(key);
    setShowPicker(false);
  }, [activeBasemap, basemaps]);

  useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.flyTo(center, zoom, { duration: flyDuration, easeLinearity: 0.25 });
    if (markerRef.current) markerRef.current.remove();
    const color = SEVERITY_COLORS[severity];
    markerRef.current = L.circleMarker(center, { radius: markerRadius, fillColor: color, fillOpacity: 0.4, color, weight: 2, opacity: 0.8 }).addTo(mapInstance.current);
    if (markerLabel) markerRef.current.bindTooltip(markerLabel, { permanent: true, direction: "top", className: "story-map-tooltip", offset: [0, -15] });
  }, [center, zoom, markerLabel, severity, flyDuration, markerRadius]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className="w-full h-full rounded-md" style={{ minHeight: "400px" }} role="img" aria-label={`Map showing ${markerLabel || "location"}`} data-testid="story-map" />
      <div className={`absolute inset-0 bg-black/20 rounded-md pointer-events-none transition-opacity duration-700 ${isReady ? "opacity-0" : "opacity-100"}`} />
      {Object.keys(basemaps).length > 1 && (
        <div className="absolute top-3 right-3 z-[1000]" data-testid="basemap-switcher">
          <button onClick={() => setShowPicker((v) => !v)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-icpac-green-700/90 backdrop-blur border border-gray-700/60 rounded-md text-xs text-gray-300 transition-colors duration-150" data-testid="button-basemap-toggle" aria-label="Change basemap">
            <Layers className="w-3.5 h-3.5" /><span className="hidden sm:inline">{basemaps[activeBasemap].name}</span>
          </button>
          {showPicker && (
            <div className="absolute top-full right-0 mt-1.5 bg-icpac-green-700/95 backdrop-blur border border-gray-700/60 rounded-md overflow-hidden shadow-xl min-w-[130px]">
              {Object.entries(basemaps).map(([key, bm]) => (
                <button key={key} onClick={() => switchBasemap(key)} className={`w-full text-left px-3 py-2 text-xs transition-colors duration-100 ${key === activeBasemap ? "bg-icpac-green/20 text-icpac-gold" : "text-gray-400"}`} data-testid={`button-basemap-${key}`}>{bm.name}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ChapterProps {
  children: ReactNode;
  center: [number, number];
  zoom: number;
  datasetId?: string;
  layerId?: string;
  datetime?: string;
  severity?: SeverityLevel;
  markerLabel?: string;
  side?: "left" | "right";
  threshold?: number;
}

export function Chapter({ children, center, zoom, datasetId, layerId, datetime, severity = "high", markerLabel, side, threshold = 0.4 }: ChapterProps) {
  const { setActiveChapter } = useContext(StorylineContext);
  const { ref, inView } = useInView({ threshold, triggerOnce: false });

  useEffect(() => {
    if (inView) setActiveChapter({ center, zoom, datasetId, layerId, datetime, severity, markerLabel });
  }, [inView, center, zoom, severity, markerLabel]);

  const isRight = side === "right";
  const slideX = isRight ? 40 : -40;

  return (
    <div ref={ref} className={`min-h-[80vh] flex items-center py-16 px-4 md:px-8 ${isRight ? "lg:justify-end" : "lg:justify-start"}`} data-testid="mdx-chapter">
      <motion.div initial={{ opacity: 0, x: slideX }} animate={{ opacity: inView ? 1 : 0.15, x: inView ? 0 : slideX }} transition={{ duration: 0.7, ease: "easeOut" }} className="w-full lg:w-[420px] xl:w-[460px] pointer-events-auto">
        <div className="bg-icpac-green-700/85 backdrop-blur-lg border border-gray-700/50 rounded-lg p-6 md:p-8 shadow-2xl prose prose-invert prose-sm max-w-none prose-headings:text-white prose-p:text-gray-200 prose-a:text-icpac-gold prose-strong:text-white prose-li:text-gray-300">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

interface StorylineProps {
  children: ReactNode;
  defaultCenter?: [number, number];
  defaultZoom?: number;
  headerOffset?: string;
  basemaps?: Record<string, BasemapConfig>;
  defaultBasemap?: string;
}

export function Storyline({ children, defaultCenter = [5, 35], defaultZoom = 4, headerOffset = "3rem", basemaps, defaultBasemap }: StorylineProps) {
  const [activeChapter, setActiveChapter] = useState<ChapterData | null>(null);
  return (
    <StorylineContext.Provider value={{ activeChapter, setActiveChapter }}>
      <div className="relative" data-testid="storyline-block">
        <div className="sticky w-full z-0" style={{ top: headerOffset, height: `calc(100vh - ${headerOffset})` }}>
          <StoryMap center={activeChapter?.center || defaultCenter} zoom={activeChapter?.zoom || defaultZoom} className="w-full h-full" markerLabel={activeChapter?.markerLabel} severity={activeChapter?.severity || "high"} basemaps={basemaps} defaultBasemap={defaultBasemap} />
        </div>
        <div className="relative z-10 pointer-events-none" style={{ marginTop: `calc(-100vh + ${headerOffset})` }}>{children}</div>
      </div>
    </StorylineContext.Provider>
  );
}

export function MapEmbed({ center, zoom, markerLabel, severity, height = "400px", interactive = false, basemaps, defaultBasemap }: { center: [number, number]; zoom: number; markerLabel?: string; severity?: SeverityLevel; height?: string; interactive?: boolean; basemaps?: Record<string, BasemapConfig>; defaultBasemap?: string }) {
  return (
    <div className="w-full rounded-md overflow-hidden" style={{ height }} data-testid="mdx-map">
      <StoryMap center={center} zoom={zoom} className="w-full h-full" markerLabel={markerLabel} severity={severity} interactive={interactive} basemaps={basemaps} defaultBasemap={defaultBasemap} />
    </div>
  );
}
