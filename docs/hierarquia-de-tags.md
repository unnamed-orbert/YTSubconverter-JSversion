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

Com a hierarquia ligada, uma sombra que deveria estar transparente (regra 3) vira a sombra automática (sem `ec`)
quando a opacidade dela está mais perto da do texto do que da opaca:

- sombra **escura** (preta/cinza-escura): troca desde o começo do fade, a cor praticamente não muda;
- sombra **colorida**: mantém a cor (opaca) enquanto a opacidade está acima do corte (a porcentagem de
  "tirar sombra no fade", 45% por padrão) e passa a acompanhar o texto abaixo dele.

Se a opção "No fade, tirar sombra/contorno abaixo de X%" também estiver ligada, ela continua valendo primeiro
(abaixo de X% a sombra é removida, "true fade").

Sombra transparente que não vem de transição (ex.: estilo com sombra `&H80000000` e texto opaco) continua como no
original (opaca), porque a opacidade dela está mais perto da opaca do que da do texto.

## Onde está no código

- `src/formats/ass/karaokeTypes.js`, `applyFadeInDecorationOpacity`: regra 3 no `\ytkt(Fade)`.
- `src/formats/ytt.js`, `letShadowsFollowText` e `splitTextOpacity`: limite do .ytt e regra 4.
- `\fad`/`\fade` e `\t` de alpha já levavam a sombra junto no modelo (`AssLine.normalizeAlpha`); o que faltava era
  a escrita do .ytt não jogar isso fora.

Opção: `tagHierarchy` em `loadAssDocument`/`AssDocument` e em `YttDocument` (desligada na biblioteca, para os
testes golden continuarem iguais ao C#). Na página é a caixa "Hierarquia de tags" (marcada); na CLI vale por padrão e
`--modo-original` desliga.

## Ainda não coberto

- `\t(\1a)` sozinho (sem `\3a`/`\4a`) continua só no texto, como no .ass: no Aegisub a sombra também fica.
- `\t` de cor junto com `\ytkt(Fade)` no mesmo trecho: as duas animações escrevem a cor e a última ganha.
- `\ytReset`/`\breakout` e o karaokê com gradiente (notas GradientKCEffect) são ideias para depois.
