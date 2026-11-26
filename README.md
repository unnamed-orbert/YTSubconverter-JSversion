# ytsubconverter-js

**Use it online:** https://petekamusic.com.br/

JavaScript port (Node.js 18+, ESM, no dependencies) of
[YTSubConverter](https://github.com/arcusmaximus/YTSubConverter), which converts subtitles
to YouTube's `.ytt` (srv3) format, preserving colors, positions, shadows, karaoke, etc.

The goal is to produce **exactly** the same file as the original C# program. That's why the
code reproduces .NET details: `float` arithmetic (via `Math.fround`), the banker's rounding
of `Math.Round`, the .NET Framework's `DateTime.AddMilliseconds` and the seeded `System.Random`.

## Usage

```sh
node bin/ytsubconverter.js subtitle.srt          # generates subtitle.ytt
node bin/ytsubconverter.js subtitle.ass output.ytt
node bin/ytsubconverter.js subtitle.ytt          # generates subtitle.srt
node bin/ytsubconverter.js subtitle.srt output.ass   # .ass with the default YT* styles
node bin/ytsubconverter.js subtitle.json3 output.ass # YouTube json3 to .ass (or output.ytt)
node bin/ytsubconverter.js subtitle.json3 output.srt # clean .srt, one line per sentence (see below)
```

The input format is detected **from the content** (`src/detect.js`), not the extension: a json3
downloaded as `timedtext` with no extension, or a `.ytt` saved as `.txt`, work the same way in the CLI and
on the web page. The extension is only used when the content isn't recognized. If no output is given, the CLI never
overwrites the input (if the names would collide, it writes `nome.convertido.ext`).

```js
import { SrtDocument, YttDocument } from './src/index.js';
const ytt = new YttDocument(SrtDocument.parse(srtText)).save();
const doc = YttDocument.parse(yttText); // reads .ytt/.srv3 (undoes the writer's tricks)
```

## Web page

The page is hosted at **https://petekamusic.com.br/**: open it in the browser, no installation needed.

`index.html` is a simple page: drag in an `.srt`, `.sbv` or `.ass` subtitle and download the `.ytt`
(or `.srt`). It runs entirely in the browser using the same modules from `src/`, with no server
and without sending the file anywhere.

After converting (or when you drop in a `.ytt`/`.srv3` directly), the page shows a **preview**: the subtitles
drawn in a 16:9 area with position, font, size, colors, background, outline/shadow, karaoke, ruby and
vertical text, with play/pause and a timeline. You can pick a video from your computer to see
the subtitles on top of it, including in fullscreen ("Fullscreen" button, F key or double-click). The preview reads the generated `.ytt` itself (`web/preview.js`) and is an approximation
of the YouTube player; tricks that depend on exactly how YouTube renders things (for example, multiple
shadows on the same line) may look slightly different.

To host your own copy: because it uses JavaScript modules, the page must be opened over HTTP, not by double-clicking the file:

- **GitHub Pages:** under *Settings → Pages*, choose *Deploy from a branch*, branch `main`, folder `/ (root)`.
  The page will be at `https://<user>.github.io/<repository>/`.
- **Locally:** run `npx serve .` (or `python3 -m http.server`) in the project folder and open the address shown.

The full documentation (formats, every tag, the options, the CLI and the limitations) is at
[`/documentacao`](https://petekamusic.com.br/documentacao/) (`documentacao/index.html`), also in the 4 languages.

The page is available in Portuguese, English, Spanish and French (`web/i18n.js`). The initial language is the
browser's (other languages fall back to English); it can be changed with the selector at the top and is saved in the browser.

## Status

| Format | Read | Write |
|---|---|---|
| .srt | ✅ | ✅ |
| .sbv | ✅ | — (the original doesn't write it either) |
| .ytt / .srv3 | ✅ | ✅ |
| .ass | ✅ | ✅ (without the "visual" mode of `VisualizingAssDocument`) |
| .json3 (YouTube) | ✅ (extra, not in the original) | — |
| .ttml | ❌ | ❌ |

### json3

`json3` is the format the YouTube player downloads (`/api/timedtext?...&fmt=json3`). It has the same
content as srv3/.ytt in JSON form (`pens`, `wsWinStyles`, `wpWinPositions`, `events` with `segs`), so
`src/formats/json3.js` translates the JSON to srv3 and uses the .ytt reader, which undoes
YTSubConverter's tricks (padding spaces, the extra copy for dark text, etc.). Files saved as
`subtitle.json3.txt`, or with another extension, are recognized by their content.

### Fix massive duplication

A .json3/.ytt full of styles and animation (`\fade`, `\move`, `\t`, karaoke, multiple shadows) repeats the
same sentence across hundreds of lines, one per frame. When converting .json3/.ytt to **.srt**, `src/dedup.js`
merges these copies into one line per sentence, like Carlos's "YTT → SRT" tool (it's a port of it, and the .srt
output is identical to the tool's): it groups by on-screen position (20% grid), merges frames with the same text (or text that
grows) separated by less than 200 ms, discards sentences shorter than 300 ms, keeps the lower one when
they overlap and closes gaps of up to 500 ms.

This is automatic for .srt output (on the page, the "Fix massive duplication" checkbox is checked by default). To
turn it off: uncheck the box, or use `--manter-duplicacao` in the CLI. For .ytt/.ass output the subtitles are left untouched,
unless you use `--corrigir-duplicacao` in the CLI.

### Recover the original tags (.ytt/.json3 → .ass)

A regular .ytt → .ass conversion returns each animation frame as a separate line. `src/recover/recoverTags.js`
(an extension, not in the original) does the reverse of `Animator.cs` and tries to reconstruct the source .ass:

- merges the copies of a line made for each shadow type into a single style (`YTGlowSoftShadowHardShadowBevel`...);
- merges consecutive frames with the same text into one line, and the lines into sentences following the deduplicator's scheme;
- looks at the whole line: opacity of all letters changing together → `\fad`/`\fade`, position moving in a straight line → `\move`,
  position jumping around a point → `\ytshake`;
- looks at each letter/syllable: colors changing in sequence → `\k` (and `\ytkt(Fade)` if the change is gradual), the native karaoke
  `t` attribute → `\k`, changes at different moments → one `\t` per segment;
- looks at text that changes from one frame to the next in the same place: a syllable that turns into a random character on the
  first frame in which it's sung → `\ytkt(Glitch)`; a short cursor ("_", "|"...) that moves along the line →
  `\ytkt(Cursor,...)` (after what has already been sung) or `\ytkt(LCursor,...)` (before the syllable being sung), with the
  interval and colors of each cursor;
- the "trail" of copies of the same text, with no shadow and each in a different color, that spread out around the text before
  it appears or after it disappears → `\ytchroma`.

Timings, radii and positions come out approximate (the .ytt stores positions as whole percentages and one state every two frames).
On the page: the "Try to recover original tags (heuristic)" button on each converted .ytt/.json3; the preview's
debug table shows the same recovery, with the reason for each tag. In the CLI:

```sh
node bin/ytsubconverter.js subtitle.ytt subtitle.recovered.ass --recuperar-tags
```

Styles with more than one shadow also go into a `.StyleOptions.xml` for the original YTSubConverter; this port
recognizes the shadow types from the style name when there's no StyleOptions for it.

#### Compare the original with the rebuilt version

After recovery, the "Compare original × rebuilt" button converts the recovered .ass back to .ytt and shows
both side by side, playing in sync. Every 100 ms, the on-screen lines from both sides are paired (by text and
position) and compared by text, position, color and opacity (`src/compare/compareYtt.js`). The page shows the
overall and per-property similarity, a time bar with the similarity and type of difference at each point, buttons
to jump between differences and, for the current instant, what differs in each line (orange outline: different line;
red: line that exists on only one side). The CLI with `--recuperar-tags` also prints the similarity.

## Tests

```sh
npm test
```

`test/files/ass/` contains the original project's test files (`X.ass` and the expected `X.ytt`,
generated by the C# program). They are compared byte by byte in both directions (.ass → .ytt and .ytt → .ass → .ytt).

## License

The original YTSubConverter is MIT (© 2018 arcusmaximus); see `LICENSE-YTSubConverter`.
The test files and the resources in `src/resources/` come from it.
