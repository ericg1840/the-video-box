# the-video-box

A 90s-style interactive music video channel, inspired by the request-a-video TV
channels of the era: dial a 4-digit code and your video goes in line.

## How it works

- **Turn on the TV** (or just start dialing) and videos start playing in a chunky CRT television.
- **Dial a code** on the phone keypad, or type digits on your keyboard, to order a video.
  Your orders go ahead of the other "callers" in the **Coming up** queue.
- When nobody has ordered anything, phantom viewers from around the country "call in"
  requests, so the channel never stops.
- Each video opens with an on-screen graphic showing its code, artist, title, and where
  the request came from. The current code stays up in the corner.
- Static bursts between videos, DTMF keypad tones, busy signals for bad codes, scanlines,
  and a scrolling ticker of codes along the bottom.
- The **Video menu** lists every code by genre. Click an entry to dial it.
- **Program your own**: paste a YouTube link or ID and it gets a code in the 9900s
  (saved in your browser).
- Videos that can't be embedded are skipped automatically.

| Codes | Genre |
|-------|-------|
| 1000–1099 | Pop (60) |
| 1100–1199 | Rock (28) |
| 1200–1499 | 70s (174) |
| 1500–1799 | 80s (192) |
| 1800–1999 | 90s (129) |
| 2000–2199 | 90s Rock (131) |
| 2200–2399 | 2000s (82) |
| 2400–2499 | Hip-Hop (14) |
| 2500–2599 | Latin (2) |
| 2600–2699 | Funk (3) |
| 2700–2799 | Indie (10) |
| 2800–2899 | Electronic (6) |
| 2900–2999 | Country (32) |
| 9900–9999 | Your own |

Keys: `0`–`9` dial · `#` random code · `*`/`Esc` clear · `Space` pause · `S` skip.

## Running it

No build step and no API key needed. It's plain HTML/CSS/JS using the
[YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference).

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Serve it over http(s) rather than opening `index.html` directly from disk, because YouTube
embeds can refuse to play on `file://` pages. It deploys as-is to any static host
(GitHub Pages, Netlify, Vercel, …).

## Adding songs to the menu

Edit `videos.js` and add an entry using the next unused code in the genre's block (the block ranges are listed at the top of the file):

```js
{ code: "1999", id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", genre: "pop" },
```
