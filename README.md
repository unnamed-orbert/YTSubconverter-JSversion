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
node bin/ytsubconverter.js legenda.srt saida.ass   # .ass com os estilos YT* padrão
node bin/ytsubconverter.js legenda.json3 saida.ass # json3 do YouTube para .ass (ou saida.ytt)
node bin/ytsubconverter.js legenda.json3 saida.srt # .srt limpo, uma linha por frase (ver abaixo)
```

O formato de entrada é reconhecido **pelo conteúdo** (`src/detect.js`), não pela extensão: um json3
baixado como `timedtext` sem extensão, ou um `.ytt` salvo como `.txt`, funcionam do mesmo jeito na CLI e
na página. A extensão só é usada quando o conteúdo não é reconhecido. Sem saída indicada, a CLI nunca
sobrescreve a entrada (se o nome coincidir, grava `nome.convertido.ext`).

```js
import { SrtDocument, YttDocument } from './src/index.js';
const ytt = new YttDocument(SrtDocument.parse(textoSrt)).save();
const doc = YttDocument.parse(textoYtt); // leitura de .ytt/.srv3 (desfaz os truques da escrita)
```

## Página web

`index.html` é uma página simples: arraste uma legenda `.srt`, `.sbv` ou `.ass` e baixe o `.ytt`
(ou `.srt`). Ela roda inteiramente no navegador com os mesmos módulos de `src/`, sem servidor
e sem enviar o arquivo para lugar nenhum.

Depois de converter (ou soltando um `.ytt`/`.srv3` direto), a página mostra um **preview**: as legendas
desenhadas numa área 16:9 com posição, fonte, tamanho, cores, fundo, contorno/sombra, karaokê, ruby e
texto vertical, com tocar/pausar e linha do tempo. Dá para escolher um vídeo do computador para ver
a legenda por cima dele, inclusive em tela cheia (botão "Tela cheia", tecla F ou duplo clique). O preview lê o próprio `.ytt` gerado (`web/preview.js`) e é uma aproximação
do player do YouTube; truques que dependem do jeito exato do YouTube desenhar (por exemplo, várias
sombras na mesma linha) podem aparecer um pouco diferentes.

Como usa módulos JavaScript, a página precisa ser aberta por HTTP, não com duplo clique no arquivo:

- **GitHub Pages:** em *Settings → Pages*, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
  A página fica em `https://<usuário>.github.io/<repositório>/`.
- **Localmente:** `npx serve .` (ou `python3 -m http.server`) na pasta do projeto e abra o endereço mostrado.

## Estado

| Formato | Leitura | Escrita |
|---|---|---|
| .srt | ✅ | ✅ |
| .sbv | ✅ | — (o original também não escreve) |
| .ytt / .srv3 | ✅ | ✅ |
| .ass | ✅ | ✅ (sem o modo "visual" do `VisualizingAssDocument`) |
| .json3 (YouTube) | ✅ (extra, não existe no original) | — |
| .ttml | ❌ | ❌ |

### json3

O `json3` é o formato que o player do YouTube baixa (`/api/timedtext?...&fmt=json3`). Ele tem o mesmo
conteúdo do srv3/.ytt em JSON (`pens`, `wsWinStyles`, `wpWinPositions`, `events` com `segs`), então
`src/formats/json3.js` traduz o JSON para srv3 e usa o leitor de .ytt, que desfaz os truques do
YTSubConverter (espaços de preenchimento, cópia para texto escuro etc.). Arquivos salvos como
`legenda.json3.txt`, ou com outra extensão, são reconhecidos pelo conteúdo.

### Corrigir duplicação massiva

Um .json3/.ytt cheio de estilos e animação (`\fade`, `\move`, `\t`, karaokê, várias sombras) repete a
mesma frase em centenas de linhas, uma por quadro. Ao converter .json3/.ytt para **.srt**, `src/dedup.js`
junta essas cópias em uma linha por frase, como a ferramenta "YTT → SRT" do Carlos (é o port dela, e o .srt
sai igual ao dela): agrupa por posição na tela (grade de 20%), junta quadros com o mesmo texto (ou texto que
cresce) separados por menos de 200 ms, descarta frases com menos de 300 ms, na sobreposição fica a mais de
baixo e fecha buracos de até 500 ms.

Isso é automático para a saída .srt (na página, a caixa "Corrigir duplicação massiva" já vem marcada). Para
desligar: desmarque a caixa, ou `--manter-duplicacao` na CLI. Para saída .ytt/.ass a legenda não é mexida,
a não ser com `--corrigir-duplicacao` na CLI.

## Testes

```sh
npm test
```

`test/files/ass/` contém os arquivos de teste do projeto original (`X.ass` e o `X.ytt` esperado,
gerados pelo programa em C#). Eles são comparados byte a byte nos dois sentidos (.ass → .ytt e .ytt → .ass → .ytt).

## Licença

O YTSubConverter original é MIT (© 2018 arcusmaximus); veja `LICENSE-YTSubConverter`.
Os arquivos de teste e os recursos em `src/resources/` vêm dele.
