# ytsubconverter-js

Port para JavaScript (Node.js 18+, ESM, sem dependências) do
[YTSubConverter](https://github.com/arcusmaximus/YTSubConverter), que converte legendas
para o formato `.ytt` (srv3) do YouTube, preservando cores, posições, sombras, karaokê etc.

O objetivo é produzir **exatamente** o mesmo arquivo que o programa original em C#. Por isso o
código reproduz detalhes do .NET: aritmética `float` (via `Math.fround`), arredondamento bancário
de `Math.Round`, `DateTime.AddMilliseconds` do .NET Framework e o `System.Random` semeado.

## Uso

```sh
node bin/ytsubconverter.js legenda.srt          # gera legenda.ytt
node bin/ytsubconverter.js legenda.ass saida.ytt
node bin/ytsubconverter.js legenda.ytt          # gera legenda.srt
```

```js
import { SrtDocument, YttDocument } from './src/index.js';
const ytt = new YttDocument(SrtDocument.parse(textoSrt)).save();
const doc = YttDocument.parse(textoYtt); // leitura de .ytt/.srv3 (desfaz os truques da escrita)
```

## Estado

| Formato | Leitura | Escrita |
|---|---|---|
| .srt | ✅ | ✅ |
| .sbv | ✅ | — (o original também não escreve) |
| .ytt / .srv3 | ✅ | ✅ |
| .ass | ⏳ (em desenvolvimento em outro branch) | ⏳ |
| .ttml | ❌ | ❌ |

## Testes

```sh
npm test
```

`test/files/ass/` contém os arquivos de teste do projeto original (`X.ass` e o `X.ytt` esperado,
gerados pelo programa em C#). Eles são comparados byte a byte assim que o leitor de `.ass` estiver integrado.

## Licença

O YTSubConverter original é MIT (© 2018 arcusmaximus); veja `LICENSE-YTSubConverter`.
Os arquivos de teste e os recursos em `src/resources/` vêm dele.
