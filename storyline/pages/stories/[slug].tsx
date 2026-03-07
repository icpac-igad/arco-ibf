import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { serialize } from "next-mdx-remote/serialize";
import { MDXRemote, type MDXRemoteSerializeResult } from "next-mdx-remote";
import dynamic from "next/dynamic";
import Head from "next/head";
import { Hero, Block, WideBlock, ProseFigure, Prose, Figure, Caption, Callout, InfoCard, StatGrid, Stat, SeverityBadge, CountryHeader, ImpactStats, StoryHeader, StoryFooter, Timeline, TimelineEntry, KeyFinding, VideoEmbed, ExternalImage } from "../../components/story-ui";

const Storyline = dynamic(() => import("../../components/story-map").then(m => m.Storyline), { ssr: false });
const Chapter = dynamic(() => import("../../components/story-map").then(m => m.Chapter), { ssr: false });
const MapEmbed = dynamic(() => import("../../components/story-map").then(m => m.MapEmbed), { ssr: false });
const CompareMap = dynamic(() => import("../../components/compare-map").then(m => m.CompareMap), { ssr: false });
const SplitMap = dynamic(() => import("../../components/compare-map").then(m => m.SplitMap), { ssr: false });

const components = {
  Block, WideBlock, ProseFigure, Prose, Figure, Caption, Chapter, Storyline,
  Map: MapEmbed, StatGrid, Stat, SeverityBadge, Hero, InfoCard,
  Callout, CountryHeader, ImpactStats, CompareMap, SplitMap,
  Timeline, TimelineEntry, KeyFinding, VideoEmbed, ExternalImage,
};

interface Props {
  source: MDXRemoteSerializeResult;
  storyName: string;
  storyDescription: string;
}

export default function StoryPage({ source, storyName, storyDescription }: Props) {
  return (
    <>
      <Head>
        <title>{storyName} | icpacViz</title>
        <meta name="description" content={storyDescription} />
      </Head>
      <div className="min-h-screen bg-icpac-green-800 text-white" data-testid="page-story">
        <StoryHeader storyName={storyName} />
        <main className="pt-16">
          <MDXRemote {...source} components={components} />
          <StoryFooter />
        </main>
      </div>
    </>
  );
}

const STORIES_DIR = path.join(process.cwd(), "content/stories");

export async function getStaticPaths() {
  const files = fs.readdirSync(STORIES_DIR).filter(f => f.endsWith(".mdx"));
  const paths = files.map(f => ({ params: { slug: f.replace(/\.mdx$/, "") } }));
  return { paths, fallback: false };
}

export async function getStaticProps({ params }: { params: { slug: string } }) {
  const filePath = path.join(STORIES_DIR, `${params.slug}.mdx`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { content, data } = matter(raw);
  const source = await serialize(content);

  return {
    props: {
      source,
      storyName: data.name || params.slug,
      storyDescription: data.description || "",
    },
  };
}
