# Exemplos

`demonstracao-tags.ass` é uma legenda de demonstração: cada tela mostra um grupo de recursos e o texto
de cada linha diz qual tag está sendo usada. Serve para testar no preview da página e para consultar
como referência. `demonstracao-tags.ytt` é o resultado da conversão.

```sh
node bin/ytsubconverter.js exemplos/demonstracao-tags.ass
```

| Tempo | Tela | Tags |
|---|---|---|
| 0:00 | Abertura | |
| 0:06 | Alinhamento | `\an1` a `\an9` |
| 0:14 | Posição e movimento | `\pos(x,y)`, `\move(x1,y1,x2,y2)`, `\move(...,t1,t2)` |
| 0:22 | Formatação, fontes e tamanho | `\b`, `\i`, `\u`, `\fn` (as 7 fontes do YouTube), `\fs` |
| 0:30 | Cores e transparência | `\c`/`\1c`, `\3c`, `\4c`, `\alpha`, `\1a`, `\3a`, `\4a` |
| 0:38 | Sombras e contorno | estilos `YTPlain`, `YTGlow`, `YTSoftShadow`, `YTHardShadow`, `YTBevel` e as versões `…Box` |
| 0:46 | Fade e transformação | `\fad`, `\fade`, `\t(...)` com cor, alpha, tamanho, tempo e aceleração |
| 0:56 | Karaokê | `\k`, `\2c`/`\2a`, `\ytktFade`, `\ytkt(Glitch)`, `\ytkt(Cursor,...)`, `\ytkt(LCursor,...)` |
| 1:08 | Efeitos | `\ytshake`, `\ytshake(x,y)`, `\ytshake(r,t1,t2)`, `\ytchroma`, `\ytchroma(...)` |
| 1:16 | Ruby e índices | `\ytruby` / `\ytruby2` com `[texto/ruby]`, `\ytsub`, `\ytsup`, `\ytsur` |
| 1:24 | Texto vertical e direção | `\ytvert1/3/7/9`, `\ytpack`, `\ytdir4`, `\ytdir6` |
| 1:32 | Quebra de linha e reset | `\N`, `\r`, `\rEstilo`, linha sem `\pos` |

As coordenadas usam a resolução do script (`PlayResX: 1280`, `PlayResY: 720`). Cores no .ass são `&HBBGGRR&`
(azul, verde, vermelho) e alpha vai de `&H00&` (opaco) a `&HFF&` (invisível). O tipo de sombra vem do nome
do estilo (os estilos `YT*` já vêm configurados).

`demonstracao-tags.srt` mostra o que o .srt aceita: `<b>`, `<i>`, `<u>` e `<font color="#rrggbb">`. No .srt
não há posição, a legenda fica sempre embaixo e no centro.
