**English** | [简体中文](README.zh-CN.md)

# z1cheng.github.io

A one-page personal site: <https://z1cheng.github.io>

## What's on it

- An orange-and-white tabby, drawn entirely in inline SVG. Its pupils follow your cursor, it blinks every few seconds, and its head turns a little with the gaze.
- A greeting that reads `Hi, I'm Chen Chen.` until you move your cursor over it, at which point a circular lens reveals `你好，我是陈辰。` wherever it passes.
- A profile strip — email, location, live local time, company, GitHub.

## How it works

`index.html` is the whole site. There is no build step, no dependencies, and it loads no external resources: styles, script, and artwork are all inline.

**The lens** is one CSS custom property driving two things at once. `--r` is registered with `@property` so it can animate from `0` to the lens radius on hover; the same value feeds a `clip-path: circle(...)` that reveals the Chinese layer and a solid disc that covers the English underneath. Both share one geometry, so the visible circle and the swapped region can never disagree. The lens follows the cursor horizontally but is pinned to the vertical centre of the text line — the greeting is a single band, so a free-floating circle ends up below the glyphs.

**The eyes** are a `requestAnimationFrame` loop. The pointer position is converted into the SVG's viewBox units, eased toward the target, and applied as a translate on each pupil group. Each pupil is clipped to its eye shape, so the iris can never escape the socket.

## Local preview

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploying

GitHub Pages, deploying from the root of `master`. `.nojekyll` tells Pages to skip the Jekyll build and serve the files exactly as committed.

## License

Released under the [MIT License](LICENSE).
