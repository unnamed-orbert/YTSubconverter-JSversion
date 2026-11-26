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
```

```js
import { SrtDocument, YttDocument } from './src/index.js';
const ytt = new YttDocument(SrtDocument.parse(textoSrt)).save();
```

## Página web

`index.html` é uma página simples: arraste uma legenda `.srt`, `.sbv` ou `.ass` e baixe o `.ytt`
(ou `.srt`). Ela roda inteiramente no navegador com os mesmos módulos de `src/`, sem servidor
e sem enviar o arquivo para lugar nenhum.

Como usa módulos JavaScript, a página precisa ser aberta por HTTP, não com duplo clique no arquivo:

- **GitHub Pages:** em *Settings → Pages*, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
  A página fica em `https://<usuário>.github.io/<repositório>/`.
- **Localmente:** `npx serve .` (ou `python3 -m http.server`) na pasta do projeto e abra o endereço mostrado.

`.ass` passa a funcionar na página assim que o leitor (`src/formats/ass/`) estiver no branch;
até lá ela mostra um aviso.

## Estado

| Formato | Leitura | Escrita |
|---|---|---|
| .srt | ✅ | ✅ |
| .sbv | ✅ | — (o original também não escreve) |
| .ytt / .srv3 | ⏳ | ✅ |
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
