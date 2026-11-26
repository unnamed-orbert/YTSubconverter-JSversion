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
- `\t` de cor junto com `\ytkt(Fade)` no mesmo trecho: as duas animações escrevem a cor e a última ganha.
- `\ytReset`/`\breakout` e o karaokê com gradiente (notas GradientKCEffect) são ideias para depois.
