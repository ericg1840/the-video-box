# the-video-box

A tiny static website that plays random YouTube music videos, back to back.

## Features

- **Shuffle play** — picks a random music video from a curated pool and auto-advances when it ends. A shuffle "bag" ensures you won't hear a repeat until the whole pool has played.
- **Prev / Next / Pause** with keyboard shortcuts (`N`, `P`, `Space`).
- **Genre filter** (pop, rock, 80s, hip-hop, latin, funk, indie, electronic, …).
- **Recently played** list — click any entry to replay it.
- **Add your own** — paste any YouTube URL or video ID; it's saved in your browser (localStorage) and mixed into the shuffle.
- Videos that can't be embedded (removed, region-locked, embedding disabled) are skipped automatically.

## Running it

No build step and no API key needed — it's plain HTML/CSS/JS using the
[YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference).

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Serve it over http(s) rather than opening `index.html` directly from disk — YouTube embeds
can refuse to play on `file://` pages.

It also deploys as-is to any static host (GitHub Pages, Netlify, Vercel, …).

## Adding songs to the built-in pool

Edit `videos.js` and add an entry:

```js
{ id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", genre: "pop" },
```
