# Miles

Interactive 3D globe showing crypto events worldwide. Built with Next.js, COBE, and Supabase.

## Features

- Premium 3D globe powered by COBE
- Light & dark mode with smooth transitions
- Live event markers — past, current, upcoming
- Side event expansion with search, date, and time filters
- Multi-stop route planner with travel time estimates
- Address/geolocation search for finding nearby venues
- Embeddable via iframe on any website

## Setup

```bash
npm install
cp .env.example .env.local
# Add your Supabase credentials to .env.local
npm run dev
```

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
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

Both `/` and `/embed` serve the globe. Use `/embed` for iframe embedding.

## Deploy to Vercel

1. Push to GitHub
2. Import repo at vercel.com
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel environment variables
4. Deploy

## Tech Stack

- **Next.js 15** — App Router
- **COBE** — WebGL globe rendering
- **Framer Motion** — Animations
- **Supabase** — Live event data
- **Tailwind CSS v4** — Styling
