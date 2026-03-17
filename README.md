# Nomadz Earth

Interactive 3D globe widget showing crypto events worldwide. Built with Next.js, MapLibre GL, and Supabase.

## Features

- 3D globe and 2D map projection toggle
- Live event markers with click-to-view details
- Side event expansion for major conferences
- Multi-stop route planner with travel time estimates
- Date range filtering
- Mobile responsive
- Embeddable via iframe on any website

## Setup

```bash
npm install
cp .env.example .env.local
# Add your Supabase credentials to .env.local
npm run dev
```

## Embed on your site

```html
<iframe
  src="https://your-domain.vercel.app/embed"
  width="100%"
  height="600"
  frameborder="0"
  style="border: none;"
></iframe>
```

Both `/` and `/embed` serve the globe widget. Use `/embed` for iframe embedding.
