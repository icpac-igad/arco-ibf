import { type ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ChevronDown, Calendar, AlertTriangle, Users, Skull,
  Home as HomeIcon, Globe, CloudRain, Thermometer, Waves, Wind, MapPin,
  ArrowUp, ExternalLink,
} from "lucide-react";
import type { SeverityLevel } from "./story-map";

const iconMap: Record<string, typeof Globe> = {
  globe: Globe, users: Users, skull: Skull, home: HomeIcon,
  alert: AlertTriangle, rain: CloudRain, thermometer: Thermometer,
  waves: Waves, wind: Wind, map: MapPin, calendar: Calendar,
};

const severityStyles: Record<SeverityLevel, string> = {
  extreme: "bg-red-500/20 text-red-300 border-red-500/30",
  severe: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  high: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  moderate: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

export function Hero({ children, scrollPrompt = "Scroll to explore" }: { children: ReactNode; scrollPrompt?: string }) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-icpac-green-800" data-testid="hero-section">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-icpac-green/30 via-icpac-green-800/90 to-icpac-green-800" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-icpac-green/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-icpac-gold/8 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 max-w-5xl mx-auto px-8 text-center space-y-10">{children}</div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 2 }} className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="flex flex-col items-center gap-3 text-icpac-gold/60">
          <span className="text-sm tracking-widest uppercase font-medium">{scrollPrompt}</span>
          <ChevronDown className="w-6 h-6" />
        </motion.div>
      </motion.div>
    </section>
  );
}

const blockWidthMap: Record<string, string> = { default: "max-w-5xl", wide: "max-w-7xl", full: "max-w-none" };

export function Block({ children, type = "default", maxWidth }: { children: ReactNode; type?: "default" | "wide" | "full"; maxWidth?: string }) {
  const w = maxWidth || blockWidthMap[type] || "max-w-5xl";
  return <section className="py-16 md:py-24 px-6 md:px-8" data-testid="mdx-block"><div className={`${w} mx-auto`}>{children}</div></section>;
}

export function WideBlock({ children }: { children: ReactNode }) {
  return <section className="py-16 md:py-24 px-6 md:px-8" data-testid="mdx-wide-block"><div className="max-w-7xl mx-auto">{children}</div></section>;
}

export function ProseFigure({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start" data-testid="mdx-prose-figure">
      {children}
    </div>
  );
}

export function Timeline({ children }: { children: ReactNode }) {
  return (
    <div className="relative pl-10 border-l-3 border-icpac-gold/30 space-y-12 my-10" data-testid="mdx-timeline">
      {children}
    </div>
  );
}

export function TimelineEntry({ date, title, children, color = "bg-icpac-gold" }: { date: string; title: string; children: ReactNode; color?: string }) {
  return (
    <div className="relative" data-testid={`timeline-entry-${date}`}>
      <div className={`absolute -left-[2.85rem] top-1 w-5 h-5 rounded-full ${color} border-3 border-icpac-green-800`} />
      <p className="text-sm font-mono text-icpac-gold/70 uppercase tracking-wider mb-2">{date}</p>
      <h4 className="text-lg font-bold text-white mb-3">{title}</h4>
      <div className="text-base text-gray-300 leading-relaxed">{children}</div>
    </div>
  );
}

export function KeyFinding({ children, number }: { children: ReactNode; number: string | number }) {
  return (
    <div className="flex gap-5 items-start bg-icpac-green-700/50 border border-icpac-green/20 rounded-xl p-6 md:p-8 my-5" data-testid={`finding-${number}`}>
      <span className="flex-shrink-0 w-10 h-10 rounded-full bg-icpac-gold/20 text-icpac-gold flex items-center justify-center text-base font-bold">{number}</span>
      <div className="text-base text-gray-200 leading-relaxed">{children}</div>
    </div>
  );
}

export function VideoEmbed({ src, title = "Video", aspectRatio = "16/9" }: { src: string; title?: string; aspectRatio?: string }) {
  return (
    <div className="relative w-full rounded-xl overflow-hidden my-8 shadow-2xl" style={{ aspectRatio }} data-testid="video-embed">
      <iframe
        src={src}
        title={title}
        className="absolute inset-0 w-full h-full"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

export function ExternalImage({ src, alt, credit, creditUrl, height = "auto" }: { src: string; alt: string; credit?: string; creditUrl?: string; height?: string }) {
  return (
    <figure className="my-8" data-testid="external-image">
      <div className="w-full rounded-xl overflow-hidden bg-icpac-green-700 border border-icpac-green/20 shadow-lg">
        <img src={src} alt={alt} className="w-full object-contain" style={{ maxHeight: height !== "auto" ? height : "600px" }} loading="lazy" />
      </div>
      {(alt || credit) && (
        <figcaption className="mt-3 text-sm text-gray-400 text-center">
          {alt}{credit && <span> — {creditUrl ? <a href={creditUrl} target="_blank" rel="noopener noreferrer" className="text-icpac-gold underline underline-offset-2">{credit}</a> : credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export function Prose({ children, size = "lg" }: { children: ReactNode; size?: "sm" | "base" | "lg" }) {
  return <div className={`prose prose-invert prose-${size} max-w-none prose-headings:text-white prose-headings:text-2xl md:prose-headings:text-3xl prose-p:text-gray-200 prose-p:text-lg prose-p:leading-relaxed prose-a:text-icpac-gold prose-strong:text-white prose-li:text-gray-200 prose-li:text-lg`} data-testid="mdx-prose">{children}</div>;
}

export function Figure({ children }: { children: ReactNode }) {
  return <figure className="my-10" data-testid="mdx-figure">{children}</figure>;
}

export function Caption({ children, attrAuthor, attrUrl }: { children: ReactNode; attrAuthor?: string; attrUrl?: string }) {
  return (
    <figcaption className="mt-3 text-sm text-gray-400 text-center" data-testid="mdx-caption">
      {children}
      {attrAuthor && <span> {attrUrl ? <a href={attrUrl} target="_blank" rel="noopener noreferrer" className="text-icpac-gold underline underline-offset-2">{attrAuthor}</a> : attrAuthor}</span>}
    </figcaption>
  );
}

export function Callout({ children, variant = "info" }: { children: ReactNode; variant?: "info" | "warning" | "danger" }) {
  const styles = { info: "bg-icpac-green/10 border-icpac-green/25", warning: "bg-icpac-gold/10 border-icpac-gold/25", danger: "bg-red-500/10 border-red-500/25" };
  return <div className={`border-2 rounded-xl p-8 md:p-10 text-center ${styles[variant]}`} data-testid="mdx-callout"><div className="text-gray-200 text-lg leading-relaxed max-w-4xl mx-auto">{children}</div></div>;
}

export function InfoCard({ children, title, icon, color = "text-icpac-gold", borderColor = "border-icpac-green/20", bgColor = "bg-icpac-green-700/40" }: { children: ReactNode; title: string; icon?: string; color?: string; borderColor?: string; bgColor?: string }) {
  const IconComp = icon ? iconMap[icon] || Globe : Globe;
  return (
    <div className={`border rounded-xl p-8 space-y-4 my-4 ${bgColor} ${borderColor}`} data-testid={`card-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center gap-4"><IconComp className={`w-7 h-7 ${color}`} /><h3 className="text-xl font-bold text-white">{title}</h3></div>
      <div className="text-base text-gray-200 leading-relaxed">{children}</div>
    </div>
  );
}

const gridColsMap: Record<number, string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" };

export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: number }) {
  return <div className={`grid grid-cols-2 ${gridColsMap[columns] || "md:grid-cols-4"} gap-5 md:gap-6 my-10`} data-testid="mdx-stat-grid">{children}</div>;
}

export function Stat({ value, label, icon, color = "text-icpac-gold" }: { value: string | number; label: string; icon?: string; color?: string }) {
  const IconComp = icon ? iconMap[icon] || Globe : Globe;
  return (
    <div className="bg-icpac-green-700/60 backdrop-blur-sm border border-icpac-green/20 rounded-xl p-6 md:p-8 text-center" data-testid={`mdx-stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <IconComp className={`w-7 h-7 ${color} mx-auto mb-3`} />
      <p className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white">{value}</p>
      <p className="text-xs md:text-sm text-gray-400 uppercase tracking-widest mt-2 font-medium">{label}</p>
    </div>
  );
}

export function SeverityBadge({ level }: { level: SeverityLevel }) {
  return (
    <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold rounded-full border ${severityStyles[level]}`} data-testid={`badge-severity-${level}`}>
      <AlertTriangle className="w-4 h-4" />{level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

export function CountryHeader({ country, code, emdat, severity, period }: { country: string; code: string; emdat?: string; severity: SeverityLevel; period: string }) {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h3 className="text-3xl md:text-4xl font-extrabold text-white not-prose" data-testid={`text-country-${code.toLowerCase()}`}>{country}</h3>
          <p className="text-sm text-gray-400 font-mono not-prose">{code} {emdat ? `\u00B7 EM-DAT: ${emdat}` : ""}</p>
        </div>
        <SeverityBadge level={severity} />
      </div>
      <div className="flex items-center gap-2.5 text-base text-gray-300 not-prose"><Calendar className="w-5 h-5 text-icpac-gold shrink-0" /><span>{period}</span></div>
    </div>
  );
}

export function ImpactStats({ affected, deaths, displaced }: { affected: string; deaths?: string; displaced?: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 my-6 not-prose">
      <div className="bg-icpac-green-600/60 rounded-xl p-4 text-center border border-icpac-green/20">
        <Users className="w-5 h-5 text-icpac-gold mx-auto mb-2" /><p className="text-xl font-bold text-white">{affected}</p><p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Affected</p>
      </div>
      {deaths && <div className="bg-icpac-green-600/60 rounded-xl p-4 text-center border border-icpac-green/20">
        <Skull className="w-5 h-5 text-red-400 mx-auto mb-2" /><p className="text-xl font-bold text-white">{deaths}</p><p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Deaths</p>
      </div>}
      {displaced && <div className="bg-icpac-green-600/60 rounded-xl p-4 text-center border border-icpac-green/20">
        <HomeIcon className="w-5 h-5 text-icpac-gold mx-auto mb-2" /><p className="text-xl font-bold text-white">{displaced}</p><p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Displaced</p>
      </div>}
    </div>
  );
}

export function StoryHeader({ storyName }: { storyName?: string }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-icpac-green-800/90 backdrop-blur-md border-b border-icpac-green/20" data-testid="story-header">
      <div className="w-full px-8 h-16 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity" data-testid="link-home">
            <img src={`${process.env.__NEXT_ROUTER_BASEPATH || ''}/icpac-logo.svg`} alt="ICPAC" className="h-8" />
            <span className="text-base font-bold text-icpac-gold tracking-tight">icpacViz</span>
          </Link>
          {storyName && <><span className="text-gray-600 text-lg">|</span><span className="text-sm text-gray-300 truncate max-w-[300px] font-medium">{storyName}</span></>}
        </div>
        <a href="https://www.icpac.net" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-gray-400 hover:text-icpac-gold transition-colors font-medium" data-testid="link-icpac"><span className="hidden sm:inline">ICPAC</span><ExternalLink className="w-4 h-4" /></a>
      </div>
    </header>
  );
}

export function StoryFooter() {
  return (
    <footer className="bg-icpac-green-900 border-t border-icpac-green/20 py-16 px-6" data-testid="story-footer">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-8 text-center">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="text-gray-400 text-base flex items-center gap-2 hover:text-icpac-gold transition-colors font-medium" data-testid="button-scroll-top">
          <ArrowUp className="w-5 h-5" />Back to top
        </button>
        <div className="flex items-center justify-center gap-6 text-sm text-gray-500 flex-wrap">
          <a href="https://www.icpac.net" target="_blank" rel="noopener noreferrer" className="hover:text-icpac-gold underline underline-offset-2 transition-colors" data-testid="link-footer-icpac">ICPAC</a>
          <span className="text-icpac-green">|</span>
          <a href="https://icpac-igad.github.io/e4drr/blog/2025-04-flood-events/" target="_blank" rel="noopener noreferrer" className="hover:text-icpac-gold underline underline-offset-2 transition-colors" data-testid="link-footer-e4drr">E4DRR</a>
          <span className="text-icpac-green">|</span>
          <a href="https://eahazardswatch.icpac.net/" target="_blank" rel="noopener noreferrer" className="hover:text-icpac-gold underline underline-offset-2 transition-colors" data-testid="link-footer-hazards">Hazards Watch</a>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <img src={`${process.env.__NEXT_ROUTER_BASEPATH || ''}/icpac-logo.svg`} alt="ICPAC" className="h-6" />
          <span className="text-gray-500">Powered by</span>
          <span className="text-icpac-gold font-bold">icpacViz</span>
        </div>
      </div>
    </footer>
  );
}
