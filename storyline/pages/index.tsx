import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { serialize } from "next-mdx-remote/serialize";
import { MDXRemote, type MDXRemoteSerializeResult } from "next-mdx-remote";
import dynamic from "next/dynamic";
import Head from "next/head";
import Link from "next/link";
import { Globe, ArrowRight, Map, Layers } from "lucide-react";
import { Hero, Block, Prose, Figure, Caption, Callout, InfoCard, StatGrid, Stat, SeverityBadge, CountryHeader, ImpactStats, StoryHeader, StoryFooter } from "../components/story-ui";

const Storyline = dynamic(() => import("../components/story-map").then(m => m.Storyline), { ssr: false });
const Chapter = dynamic(() => import("../components/story-map").then(m => m.Chapter), { ssr: false });
const MapEmbed = dynamic(() => import("../components/story-map").then(m => m.MapEmbed), { ssr: false });
const CompareMap = dynamic(() => import("../components/compare-map").then(m => m.CompareMap), { ssr: false });
const SplitMap = dynamic(() => import("../components/compare-map").then(m => m.SplitMap), { ssr: false });

const components = {
  Block, Prose, Figure, Caption, Chapter, Storyline,
  Map: MapEmbed, StatGrid, Stat, SeverityBadge, Hero, InfoCard,
  Callout, CountryHeader, ImpactStats, CompareMap, SplitMap,
};

interface StoryMeta {
  slug: string;
  name: string;
  description: string;
  pubDate: string;
}

interface Props {
  stories: StoryMeta[];
}

export default function Home({ stories }: Props) {
  return (
    <>
      <Head>
        <title>icpacViz | Climate Data & Events Visualization</title>
        <meta name="description" content="Interactive storyline platform for climate events — floods, droughts, and hazards." />
      </Head>
      <div className="min-h-screen bg-icpac-green-800 text-white" data-testid="page-home">
        <StoryHeader />
        <main className="pt-14">
          <section className="relative min-h-[85vh] flex flex-col items-center justify-center overflow-hidden bg-icpac-green-800" data-testid="hero-section">
            <div className="absolute inset-0">
              <div className="absolute inset-0 bg-gradient-to-b from-icpac-green/30 via-icpac-green-800/90 to-icpac-green-800" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-icpac-green/15 rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-icpac-gold/8 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10 max-w-5xl mx-auto px-8 text-center space-y-8">
              <div className="flex items-center justify-center gap-4 mb-6">
                <img src={`${process.env.__NEXT_ROUTER_BASEPATH || ''}/icpac-logo.svg`} alt="ICPAC" className="h-16 md:h-20" />
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-icpac-gold" data-testid="text-site-title">icpacViz</h1>
              </div>
              <p className="text-xl md:text-2xl text-gray-200 max-w-3xl mx-auto leading-relaxed" data-testid="text-site-description">
                Interactive storyline platform for climate events — floods, droughts, and hazards.
                Explore disasters through maps, data, video, and narrative.
              </p>
              <div className="flex items-center justify-center gap-6 pt-6 text-base text-gray-400">
                <span className="flex items-center gap-2"><Map className="w-5 h-5 text-icpac-gold" /> Interactive Maps</span>
                <span className="flex items-center gap-2"><Layers className="w-5 h-5 text-icpac-gold" /> Compare Views</span>
              </div>
            </div>
          </section>

          <section className="py-20 md:py-28 px-6 md:px-8" data-testid="stories-list">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-10" data-testid="text-stories-heading">Climate Stories</h2>
              <div className="grid gap-8">
                {stories.map((story) => (
                  <Link key={story.slug} href={`/stories/${story.slug}`} className="group block" data-testid={`link-story-${story.slug}`}>
                    <div className="bg-icpac-green-700/50 backdrop-blur border border-icpac-green/20 rounded-xl p-8 md:p-10 transition-all duration-200 hover:border-icpac-gold/40 hover:bg-icpac-green-700/70 hover:shadow-xl hover:shadow-icpac-gold/5">
                      <div className="flex items-start justify-between gap-6">
                        <div className="space-y-3">
                          <h3 className="text-2xl md:text-3xl font-bold text-white group-hover:text-icpac-gold transition-colors" data-testid={`text-story-title-${story.slug}`}>
                            {story.name}
                          </h3>
                          <p className="text-base md:text-lg text-gray-300 leading-relaxed" data-testid={`text-story-desc-${story.slug}`}>
                            {story.description}
                          </p>
                          <p className="text-sm text-gray-500 mt-3 font-medium">{story.pubDate}</p>
                        </div>
                        <ArrowRight className="w-7 h-7 text-gray-600 group-hover:text-icpac-gold transition-colors shrink-0 mt-2" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <StoryFooter />
        </main>
      </div>
    </>
  );
}

export async function getStaticProps() {
  const storiesDir = path.join(process.cwd(), "content/stories");
  const files = fs.readdirSync(storiesDir).filter(f => f.endsWith(".mdx"));

  const stories: StoryMeta[] = files.map(f => {
    const raw = fs.readFileSync(path.join(storiesDir, f), "utf-8");
    const { data } = matter(raw);
    const date = data.pubDate ? new Date(data.pubDate) : new Date(0);
    return {
      slug: f.replace(/\.mdx$/, ""),
      name: data.name || f.replace(/\.mdx$/, ""),
      description: data.description || "",
      pubDate: data.pubDate ? date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "",
      _sortDate: date.getTime(),
    };
  }).sort((a, b) => (b as any)._sortDate - (a as any)._sortDate).map(({ _sortDate, ...rest }) => rest);

  return { props: { stories } };
}
