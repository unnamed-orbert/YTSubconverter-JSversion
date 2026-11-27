# Hierarquia de tags (fade + karaokê + chroma)

Extensão do port. No YTSubConverter original as tags que mexem na opacidade não têm ordem entre si: cada uma
escreve a cor/opacidade do trecho e a última ganha, e no fim a escrita do .ytt deixa toda sombra opaca. Com isso
o `\fad`/`\fade` e o karaokê `\ytkt(Fade)` "quebram": o texto some (ou aparece) e o contorno fica inteiro.

A ideia aqui é que as tags não se cancelam: elas atuam em **dimensões diferentes** e se **compõem**.

## Classes

| Classe | Tags | Papel |
|---|---|---|
| Decoração | `\c \1c \3c \4c \1a \3a \4a \alpha \b \i \u \fn \fs \bord \shad`, estilo, `\ytsub \ytsup \ytpack \ytruby` | Como o texto é desenhado (cor, sombra, contorno). Sempre vale. |
| Destaque (highlight) | `\k \kf \ko \K \ytkt(...)`, `\2c \2a` | Base temporal: qual sílaba já foi cantada. Decide a cor do trecho (cantado/não cantado). |
| Transição | `\fad \fade \t \move` | Muda as outras classes ao longo do tempo. Modifica o destaque, não o cancela. |
| Camada | `\ytchroma` (cópias coloridas), tipos de sombra do estilo (cópias do .ytt) | Cria cópias do texto por cima/baixo. As cópias herdam destaque e transição. |
| Reset (ideia, não implementada) | `\ytReset`/`\breakout` | Prioridade 1: suspende os outros efeitos num intervalo. |

## Regras de composição

1. **Opacidade multiplica.** opacidade final = decoração × destaque × transição × camada.
   Ex.: sílaba ainda entrando no `\ytkt(Fade)` (30%) dentro do fim de um `\fad` (50%) fica com 15%.
2. **Cor:** o destaque escolhe a cor (`\1c` cantado, `\2c` não cantado); a camada `\ytchroma` troca a cor das
   cópias mas mantém a opacidade que veio do destaque e da transição (PR #24: o karaokê continua nas cópias).
3. **A sombra/contorno/caixa seguem o texto deles** nas transições: se o fade ou o karaokê deixam o texto com 40%
   da opacidade, a sombra também fica com 40% da dela. (No original só o texto do `\ytkt(Fade)` sai do `\2c`; a
   sombra nascia opaca.)
4. **Camadas não somam opacidade.** Quando o .ytt desenha o texto N vezes (uma cópia por tipo de sombra), cada
   cópia fica com a fração `1 - (1 - a)^(1/N)`, para que juntas deem a opacidade `a` pedida.

## Limite do .ytt e o que a escrita faz

O .ytt não tem opacidade de sombra. Só existem duas sombras possíveis:

- com `ec` (cor qualquer): **opaca**, não importa o `fo` do texto;
- sem `ec`: **cinza #222222 com a opacidade do texto** (`fo`).

Mas a cor do `ec` pode mudar a cada quadro. Com a hierarquia ligada, uma sombra que deveria estar transparente
(a opacidade dela está mais perto da do texto do que da opaca: `\fad`, `\fade`, `\ytkt(Fade)`, `\t` de alpha):

- enquanto o texto está acima do corte (**40%** por padrão, a porcentagem "tirar sombra/contorno abaixo de"), o `ec` do **contorno (Glow)**
  continua opaco e a cor dele vai da cor da sombra até a **cor do texto** (a cor em destaque), chegando nela
  exatamente no corte. O contorno "se dissolve" no texto em vez de ficar como um rastro;
- as sombras deslocadas (suave, dura, relevo) **não** vão para a cor do texto: na cor do texto elas viram um borrão
  claro em volta das letras. As escuras viram a sombra automática (#222222 com o `fo` do texto) e somem junto; as
  coloridas ficam como estão até o corte;
- abaixo do corte o contorno e as sombras saem e o texto some sozinho pela opacidade, como o fade do libass.

No `\ytkt(Fade)` é o caminho inverso: a sílaba entra só com o texto e, a partir de 40%, ganha um contorno da cor
dela que vai virando a cor do contorno.

Na biblioteca existe também `shadowFade: 'cinza'` (sombra automática #222222 acompanhando o `fo`), que foi a
primeira versão; no preview ficou pior (o contorno colorido virava cinza).

Sombra transparente que não vem de transição (ex.: estilo com sombra `&H80000000` e texto opaco) continua como no
original (opaca), porque a opacidade dela está mais perto da opaca do que da do texto.

## Destaque × transição (\k × \t)

No .ytt o karaokê com troca gradual (`\ytkt(Fade)`, `\kf`) é tecnicamente uma troca de cor no tempo, igual a um
`\t(\c)`. No C# a troca do karaokê ia até a cor fixa do `\1c` e era aplicada por último, então apagava o `\t` do
mesmo trecho. Agora a troca do karaokê vai do `\2c` até a cor que o trecho tem naquele momento, com os `\t` já
aplicados (`KaraokeColorAnimation`): o destaque modifica a transição em vez de cancelar.

- `\kf` e `\K` (o C# ignorava: a sílaba ficava sem duração) enchem a sílaba durante a duração dela, do `\2c` ao
  `\1c` (o .ytt não tem o preenchimento da esquerda para a direita).
- `\ko`: a sílaba ainda não cantada fica sem contorno.
- `\k`, `\kf` e `\ko` podem se misturar na mesma linha.
- Recuperação (.ytt → .ass): quando a primeira troca de cada letra anda em sequência e as seguintes acontecem
  juntas em todas as letras, sai `\k` + um `\t` da linha, em vez de um `\t` por letra.

## Layer

O `Layer` do .ass decide quem fica por cima (o maior). No .ytt fica por cima o `<p>` que vem depois; o C# ordenava só
pelo início. Agora, quando há linhas fora do Layer 0, os `<p>` vão por Layer e, dentro dele, pelo início.

## Cor × opacidade (como no libass)

No libass a cor e a opacidade de cada parte (texto, `\2c`, contorno/caixa, sombra) são independentes:

- Um `\t` que só muda a cor (`\t(\3c&HAF00B2&)`) e um `\t` que só muda a opacidade (`\t(0,40,\alpha&H00&)`) correm
  juntos. No C# o último apagava o outro: a caixa sumia ou parava de mudar de cor quando cada letra tinha seu
  `\alpha` + `\t` (efeito letra por letra).
- Uma tag fixa depois de um `\t` só fixa a parte dela: `\c` fixa a cor e mantém o fade do `\t(\alpha)`, `\alpha`
  fixa a opacidade e mantém a troca de cor do `\t(\c)`. No C# a tag apagava a animação inteira.

No código: `ColorAnimation.channel` (`'rgb'`, `'alpha'` ou `'all'`, que é o do C#) em `src/animations/animations.js`,
e `pinAnimations` em `src/formats/ass/tags.js`.

Valem sempre, mesmo sem a hierarquia (o C# erra e o libass é a referência):

- `\move(x1,y1,x2,y2,0,0)` (tempos 0 ou negativos) anda durante a linha inteira.
- Vale o primeiro `\pos` ou `\move` da linha (no C# o `\move` ganhava sempre).

## Onde está no código

- `src/formats/ass/karaokeTypes.js`, `applyFadeInDecorationOpacity`: regra 3 no `\ytkt(Fade)`.
- `src/formats/ytt.js`, `letShadowsFollowText` (cor do `ec` e corte) e `splitTextOpacity` (regra 4).
- `\fad`/`\fade` e `\t` de alpha já levavam a sombra junto no modelo (`AssLine.normalizeAlpha`); o que faltava era
  a escrita do .ytt não jogar isso fora.

Opção: `tagHierarchy` em `loadAssDocument`/`AssDocument` e em `YttDocument` (desligada na biblioteca, para os
testes golden continuarem iguais ao C#). Na página é a caixa "Hierarquia de tags" (marcada); na CLI vale por padrão e
`--modo-original` desliga.

## Ainda não coberto

- `\t(\1a)` sozinho (sem `\3a`/`\4a`) continua só no texto, como no .ass: no Aegisub a sombra também fica.
- `\ytReset`/`\breakout` e o karaokê com gradiente (notas GradientKCEffect) são ideias para depois.
