# icpacViz - Climate Data & Events Visualization

Interactive storyline platform for visualizing climate data and climate events — floods, droughts, and other hazards across the ICPAC region. Built with Next.js, MDX, and Leaflet.

## Current Status

A working storyline platform that renders MDX-based climate event stories with interactive map components, video, and graphics. Currently includes a flood story on impact-based forecasting in Nairobi/East Africa. Can be extended to cover droughts, landslides, cyclones, and other climate events.

### Features

- **Storyline maps** - Sticky Leaflet maps that fly to locations as the reader scrolls through chapters
- **Compare & split views** - Side-by-side and swipe-slider map comparisons (before/after imagery)
- **Rich MDX components** - Hero sections, stat grids, callouts, timelines, video embeds, graphics, and more
- **Multiple basemaps** - Satellite, dark, terrain, and street basemaps with a switcher UI
- **Video and graphics** - Embed videos, external images, and figures with captions into any story
- **Auto-routing** - Drop an `.mdx` file in `content/stories/` and it becomes a page automatically

## Project Structure

```
EOViz-Flood-Story/
├── components/
│   ├── story-map.tsx       # Storyline, Chapter, MapEmbed
│   ├── compare-map.tsx     # CompareMap (swipe), SplitMap (side-by-side)
│   └── story-ui.tsx        # Hero, Prose, StatGrid, Callout, Timeline, etc.
├── content/
│   └── stories/            # MDX story files go here
│       └── east-africa-climate-floods.mdx
├── pages/
│   ├── index.tsx           # Homepage - lists all stories
│   └── stories/[slug].tsx  # Dynamic route - renders any MDX story
├── styles/                 # Global CSS / Tailwind
└── public/                 # Static assets (images, etc.)
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

### Production Build

```bash
npm run build
npm start
```

## Adding a New Story

1. Create a new `.mdx` file in `content/stories/`, e.g. `content/stories/my-story.mdx`
2. Add frontmatter at the top:

```mdx
---
name: "My Story Title"
description: "A short description of the story."
pubDate: 2025-01-15
---
```

3. Write your story using the available components:

```mdx
<Hero scrollPrompt="Scroll to explore">
  # My Story Title
  Introduction text here.
</Hero>

<Storyline defaultCenter={[1.3, 36.8]} defaultZoom={6}>
  <Chapter center={[1.3, 36.8]} zoom={10} markerLabel="Location A" severity="high">
    ## Chapter 1
    Text that appears as the map flies to this location.
  </Chapter>

  <Chapter center={[-1.3, 36.8]} zoom={12} markerLabel="Location B" severity="extreme">
    ## Chapter 2
    The map flies here when the reader scrolls to this chapter.
  </Chapter>
</Storyline>

<CompareMap
  center={[1.3, 36.8]}
  zoom={12}
  leftLayer="satellite"
  rightLayer="terrain"
  leftLabel="Before"
  rightLabel="After"
/>
```

4. The story automatically appears on the homepage and is accessible at `/stories/my-story`.

### Available MDX Components

| Component | Description |
|---|---|
| `Hero` | Full-width hero section with scroll prompt |
| `Storyline` | Sticky map container for scroll-driven chapters |
| `Chapter` | A scroll-triggered chapter within a storyline block |
| `Map` | Standalone embedded map |
| `CompareMap` | Swipe-slider comparison of two map layers |
| `SplitMap` | Side-by-side comparison of two map layers |
| `Block` / `WideBlock` | Content containers |
| `Prose` | Styled text block |
| `StatGrid` / `Stat` | Statistics display grid |
| `Callout` | Highlighted callout box |
| `InfoCard` | Information card |
| `Timeline` / `TimelineEntry` | Vertical timeline |
| `KeyFinding` | Highlighted finding |
| `Figure` / `Caption` | Image with caption |
| `VideoEmbed` | Embedded video |
| `ExternalImage` | External image with attribution |

## Future: TiTiler Integration

The next major extension is integrating [TiTiler](https://developmentseed.org/titiler/) to serve Cloud Optimized GeoTIFFs (COGs) as dynamic map tile layers. This will enable:

- **Live satellite imagery overlays** - Render COGs directly on the Leaflet maps without pre-tiling
- **Dynamic band combinations** - Choose RGB band combos, apply colormaps, and adjust rescaling on the fly
- **Before/after COG comparison** - Use CompareMap and SplitMap with actual satellite data instead of static basemaps
- **Per-pixel statistics** - Query flood extent, NDVI, or other indices for specific regions

### Planned Approach

1. **Add a `tileUrl` prop** to `StoryMap`, `MapEmbed`, `CompareMap`, and `SplitMap` components to accept TiTiler tile endpoints as overlay layers on top of basemaps.

2. **TiTiler tile URL format:**
   ```
   https://<titiler-host>/cog/tiles/{z}/{x}/{y}
     ?url=<COG_URL>
     &bidx=1
     &colormap_name=blues
     &rescale=0,1
   ```

3. **Usage in MDX stories:**
   ```mdx
   <Map
     center={[-1.3, 36.8]}
     zoom={12}
     tileUrl="https://titiler.example.com/cog/tiles/{z}/{x}/{y}?url=s3://bucket/flood.tif&colormap_name=blues"
   />

   <CompareMap
     center={[-1.3, 36.8]}
     zoom={12}
     leftTileUrl="https://titiler.example.com/cog/tiles/{z}/{x}/{y}?url=s3://bucket/pre-flood.tif"
     rightTileUrl="https://titiler.example.com/cog/tiles/{z}/{x}/{y}?url=s3://bucket/post-flood.tif"
     leftLabel="Pre-Flood"
     rightLabel="Post-Flood"
   />
   ```

4. **Key TiTiler endpoints:**
   - `/cog/tiles/{z}/{x}/{y}` - Raster tiles from a COG
   - `/cog/info` - Band info and bounds
   - `/cog/statistics` - Pixel statistics for a region
   - `/cog/preview` - Thumbnail preview

### TiTiler Deployment Options

- **Local development:** `pip install titiler.core uvicorn` and run with `uvicorn titiler.application.main:app`
- **Docker:** `docker run -p 8000:8000 ghcr.io/developmentseed/titiler`
- **Cloud:** Deploy on AWS Lambda, Azure Functions, or as a standalone service
