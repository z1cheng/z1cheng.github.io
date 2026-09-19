**English** | [简体中文](README.zh-CN.md)

# z1cheng.github.io

Chen Chen's personal corner of the internet: <https://z1cheng.github.io>.
A human, an orange cat named 气气, and a terminal drawer.

## The page

- A single-page profile and cat, with a plain-text header entry opening a modal terminal drawer. Desktop slides up from the bottom; phones use a near-full-screen drawer.
- Wheel and touch gestures are not intercepted. The terminal scrolls independently; taller mobile content can extend naturally. Reduced-motion settings disable scene effects.
- A dark grid and amber accents, with light and system themes too.
- The original orange-and-white SVG cat follows your pointer. Click it, press its button, or gently drag with a mouse to pet it. Head and chin scratches have different responses. On touchscreens, tap to pet; swiping can still scroll the page.
- The cat gets drowsy after 18 seconds without interaction and sleeps after 30 seconds. Activity wakes an automatic nap. A manual nap stays until you pet it or use `wake` (or its wake button).
- The interface, cat messages, command help and errors are in Simplified Chinese, with familiar English command names. The greeting shows Chen Chen by default; the lens reveals 陈辰, keyboard focus reveals the full Chinese name, and touch reveals the lens briefly.
- Visible email, company, location and GitHub details, a live China clock, and a pat counter (saved only on the visitor's device).
- Animations respect reduced-motion settings and can be paused with `motion off`. Work pauses while the page is hidden.

## Terminal

The terminal is a browser playground, not a system shell. There are no external API calls. Profile commands print clickable links rather than opening new windows automatically.

| Category | Commands |
| --- | --- |
| Explore | `help [command]`, `whoami`, `about`, `projects`, `github`, `email`, `ls`, `cat [file]`, `pwd`, `tree` |
| Cat | `pet [head\|chin]`, `feed`, `sleep`, `wake`, `status`, `meow`, `sudo pet` |
| Tools | `date`, `time`, `calc <expression>`, `echo <text>`, `base64 encode\|decode <text>`, `uuid`, `roll [sides]`, `fortune` |
| Session | `theme [dark\|light\|auto]`, `motion [on\|off]`, `uptime`, `history`, `neofetch`, `banner`, `clear`, `exit` |

Try `calc (2 + 3) * 4`, `base64 encode "你好，猫"`, or `cat dreams.txt`.

- **Tab:** complete commands and arguments; press again to cycle matches. Empty input or Shift+Tab retains normal keyboard navigation.
- **↑ / ↓:** recall up to 50 recent commands and return to your draft.
- **⌘/Ctrl K** or **\`:** open and focus the terminal (the backtick shortcut only applies outside text inputs).
- **Ctrl C:** cancel the current input when no text is selected. **Esc:** close the drawer.
- The expand button grows the terminal in place. `exit` closes the drawer and preserves the session.
- `ls`, `pwd`, `tree` and `cat` browse a small virtual bookshelf, never your filesystem. The calculator uses a small arithmetic parser, not dynamic code evaluation. Output is inserted as text and capped at 160 entries.

## Files and preview

`index.html` contains the markup and original inline SVG, `style.css` the responsive themes and animations, and `app.js` the companion state and command registry. There are no runtime dependencies, external assets or build steps.

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173>.

The optional development dependency, jsdom, is only for DOM integration tests:

```sh
npm ci
npm run check
npm test
```

Tests cover idle and manual sleep, petting, persistence failures, themes, keyboard handling, arithmetic, UTF-8 Base64, command validation and safe output. Check responsive layout and appearance in a real browser after visual changes.

## Deploying

GitHub Pages serves the root of `master`. Keep `index.html`, `style.css` and `app.js` together. `.nojekyll` skips the Jekyll build. Node and `node_modules` are not needed in production.

Released under the [MIT License](LICENSE).
