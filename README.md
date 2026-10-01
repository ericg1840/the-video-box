# the-video-box

A 90s-style interactive music video channel, inspired by the request-a-video TV
channels of the era: dial a 3-digit code and your video goes in line.

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
- **Program your own**: paste a YouTube link or ID and it gets a code in the 950s
  (saved in your browser).
- Videos that can't be embedded are skipped automatically.

| Codes | Genre       |
|-------|-------------|
| 1xx   | Pop         |
| 2xx   | Rock        |
| 3xx   | 80s         |
| 4xx   | Hip-Hop     |
| 5xx   | Latin       |
| 6xx   | Funk        |
| 7xx   | Indie       |
| 8xx   | Electronic  |
| 901–949 | Country   |
| 950–999 | Your own  |

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

Edit `videos.js` and add an entry with an unused code in the right genre range:

```js
{ code: "123", id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", genre: "pop" },
```
