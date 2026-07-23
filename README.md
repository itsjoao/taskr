# taskr

Rastreador de tarefas diário, offline, para Windows. Cada dia é gerado a partir de um
template editável, organizado por épicos (clientes/projetos).

## Instalar

O instalador fica em `dist/taskr Setup <versão>.exe`. Ele cria atalho na área de
trabalho e permite escolher a pasta de instalação.

Para rodar em modo desenvolvimento:

```
npm install
npm start
```

Para gerar o instalador de novo:

```
npm run dist
```

> A interface está em inglês. Esta documentação segue em português.

## Como funciona

**Geração diária.** Ao abrir o app (ou à meia-noite, com ele aberto), a lista do dia é
montada a partir do template. Tarefas não concluídas do dia anterior **seguem** para o
dia atual, levando junto o título, a resposta, os comentários e os arquivos vinculados.
Se o app ficar dias fechado, tudo que estava aberto vem para o dia atual de uma vez.

**O dia que passou fica exatamente como estava.** Nada é apagado do dia a que pertence:
o registro de ontem mantém *todas* as tarefas — as concluídas e as que ficaram abertas.
Uma tarefa em aberto não é *movida*, e sim **copiada** para o dia seguinte; a original
permanece no seu dia, marcada com `↷`, como histórico. Uma tarefa concluída nunca viaja:
fica no dia em que foi concluída, que é onde de fato aconteceu. Itens do template (como
o *daily*) reaparecem no dia seguinte como cópia nova, independentemente disso.

**Planejamento.** Navegar para um dia futuro (seta `→` ou clicando no calendário) já gera
a lista daquele dia, para você deixar tarefas e anotações prontas. Dias futuros que você
abrir mas não preencher são descartados automaticamente, para não poluir o calendário.

Ao abrir um dia futuro, as tarefas ainda **em aberto hoje aparecem já em cinza** (com
`↷` e a etiqueta `carries over`), como prévia do que vai rolar para lá. É só uma
visualização — não depende do relógio e não altera o dia de hoje; elas viram tarefas
reais e editáveis quando o dia efetivamente chega.

**Tarefa.** Cada uma tem checkbox, horas, um campo de **resposta** (`>` — o que foi feito
e como) e um de **comentários** (`#` — extra, aberto pelo botão `#`). Uma tarefa arrastando
há vários dias ganha o selo `↻3d`.

**Template (aba TPL).** Edite épicos e seus itens padrão a qualquer momento. Mudanças
valem a partir da próxima geração diária — a lista de hoje não é alterada.

**Barra de horas.** No rodapé, um bloco por tarefa, largura proporcional às horas,
agrupado por épico. A meta do dia começa em **8h** e se ajusta no `−` / `+` ao lado
de `META`. Passando da meta, a barra se reescala, um traço laranja marca onde a meta
foi cruzada e o total fica laranja.

**Pastas e arquivos.** Ao lado de cada épico há um `+` — clique para vincular uma pasta
do sistema. Vinculada, ele vira `▸ …pasta\sub` e um clique abre no Explorer. Para trocar
ou desvincular, use a aba `TPL`.

Cada tarefa aceita arquivos pelo botão `@`. O seletor **já abre dentro da pasta do
épico**, então dá para pegar um arquivo lá dentro ou em qualquer subpasta. Os arquivos
viram etiquetas abaixo da tarefa: clique para abrir, `✕` para desvincular.

São referências por caminho — o app não copia nem move nada. Mover ou renomear o
arquivo depois quebra o vínculo, e ao clicar você recebe "caminho nao encontrado".

**Prazos.** O botão `+ due` na tarefa define uma data. A etiqueta fica discreta se
ainda falta tempo, preta no dia do prazo e **laranja quando atrasa**. O prazo viaja
junto com a tarefa enquanto ela continua em aberto.

**Horas por épico.** No cabeçalho do épico há um campo `EPIC − 0 h +` para tempo que não
pertence a nenhuma tarefa específica (reunião solta, suporte, deslocamento). Ele fica
escondido enquanto vale zero e aparece ao passar o mouse.

O número em negrito à direita é o **total do épico = tempo do épico + soma das tarefas**.
Ou seja, lançar horas numa tarefa também aumenta a conta do épico. O medidor do rodapé
continua mostrando um bloco por tarefa, mais um bloco para o tempo avulso — a divisão
não se perde. É por dia, não global.

**Sidebar de arquivos.** O botão `☰` abre uma lateral com tudo que já foi vinculado,
agrupado por épico: a pasta do épico e cada arquivo, com o dia e a tarefa de origem.
Clique para abrir. Ela não navega no disco — só mostra o que você já vinculou.

**Busca (⌖ no topo, ou `Ctrl+F` / `/`).** O botão de lupa desliza e vira um campo de
busca. Procura de uma vez em **épicos, tarefas** (título, resposta e comentários) **e
arquivos** vinculados. Cada resultado mostra onde está; clicar leva ao dia da tarefa e
destaca a linha por um instante. `↑` `↓` navegam, `Enter` abre o primeiro, `Esc` fecha.

**Notas (botão `▲ NOTES` no rodapé, ou `Ctrl+J`).** Abre uma gaveta para cima com um
bloco de notas livre — **uma nota por dia**, salva como um `.txt` simples. Um navegador
de dias (`◀ data ▶`) percorre as notas; o ponto laranja no botão indica que hoje já tem
nota. Salva sozinha enquanto você digita. Arraste a **alça no topo** da gaveta para
aumentar ou diminuir a altura (fica salvo).

Digite **`@`** para vincular uma tarefa: aparece uma lista das suas tarefas (mais
recentes primeiro) e a escolhida vira uma **linha de cabeçalho** `@Título` na nota,
destacada em negrito com uma régua embaixo. É texto puro no `.txt` — a linha começa
com `@`.

**Modo escuro (☾ no topo, ou `Ctrl+D`).** Alterna entre claro e escuro; fica salvo entre
sessões. É o mesmo layout, num quase-preto quente.

**Tamanho da fonte.** `A−` / `A+` no topo, ou `Ctrl` `+` / `−`. Fica salvo entre sessões.

**Hoje em laranja.** A data no topo e a célula do dia no calendário ficam laranja quando
são hoje. No calendário, o dia selecionado ganha um contorno preto por dentro, então dá
para ver os dois ao mesmo tempo.

**A aba `TMPLT` tem fundo cinza** — é o modo de configuração, não o registro do dia.

## Exportar / importar (botão `⋯`)

**Exportar** — escolha o escopo (dia atual, mês atual, tudo) e o formato:

- **texto** — relatório legível, pronto para colar em e-mail ou mensagem. Só leitura.
- **json** — backup completo, o único formato que dá para importar de volta.

Depois, `copiar` (vai para a área de transferência) ou `salvar...` (escolhe o arquivo).

**Importar** — aceita apenas json:

- **mesclar** — adiciona só o que falta, identificando pelos ids. Reimportar o mesmo
  arquivo duas vezes não duplica nada. Útil para juntar dados de outra máquina.
- **substituir tudo** — troca todos os seus dados pelos do arquivo (pede confirmação).
  O `tracker-data.bak.json` anterior continua lá caso precise voltar.

Tarefas cujo épico não existe são ignoradas na mesclagem, para não criar órfãos.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `←` / `→` | dia anterior / próximo |
| `T` | volta para hoje |
| `1` `2` `3` | day / cal / tmplt |
| `Ctrl+Enter` | conclui a tarefa onde o cursor está |
| `Ctrl+N` | nova tarefa no épico atual |
| `Ctrl+F` ou `/` | busca |
| `Ctrl+J` | abre / fecha as notas |
| `Ctrl+D` | modo claro / escuro |
| `Ctrl+E` | exportar / importar |
| `Ctrl` `+` / `−` / `0` | aumenta / diminui / reseta a fonte |
| `Esc` | sai do campo em edição |
| `F12` | devtools |

## Dados

Tudo fica em `Documentos\taskr`, à vista:

```
Documentos\taskr\
  tracker-data.json       todas as tarefas, épicos e template (gravação atômica)
  tracker-data.bak.json   backup rotativo do último estado íntegro
  notes\
    2026-07-23.txt        uma nota por dia, texto puro
    2026-07-24.txt
```

Se o `tracker-data.json` for corrompido, o app recupera do backup e avisa. Instalações
anteriores guardavam os dados em `%APPDATA%` (nas pastas `Task Tracker` ou `taskr`); ao
abrir esta versão pela primeira vez, esse arquivo é copiado para `Documentos\taskr`
automaticamente (o original fica onde estava, como segurança). Nenhum dado sai da máquina.

**Os dados ficam fora do executável**, inclusive na versão portátil — o `.exe` só carrega
o programa. Compartilhar o executável não compartilha nenhuma tarefa, nota ou comentário
seu. Para levar os dados de propósito, use o export json (ou copie a pasta `taskr`).

## Estrutura

```
electron/main.js      janela sem moldura, IPC, persistência atômica, notas em disco
electron/preload.js   ponte segura (contextIsolation) para dados, notas, janela e zoom
src/store.js          modelo, geração diária, cópia entre dias, busca, planejamento
src/app.js            renderização das 3 views, busca, gaveta de notas, atalhos
src/styles.css        design system
```

Em desenvolvimento, o console expõe `__debugSetToday('2026-07-25')`, `__debugState()` e
`__debugReset()` para simular a virada de dia sem mexer no relógio do sistema.
