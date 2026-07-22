# Task Tracker

Rastreador de tarefas diário, offline, para Windows. Cada dia é gerado a partir de um
template editável, organizado por épicos (clientes/projetos).

## Instalar

O instalador está em `dist/Task Tracker Setup 1.0.0.exe`. Ele cria atalho na área de
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
montada a partir do template. Tarefas não concluídas do dia anterior **migram** para o
dia atual, levando junto resposta, comentários e horas já lançadas — não são duplicadas.
Se o app ficar dias fechado, tudo que estava aberto vem para o dia atual de uma vez.

**Planejamento.** Navegar para um dia futuro (seta `→` ou clicando no calendário) já gera
a lista daquele dia, para você deixar tarefas e anotações prontas. Dias futuros que você
abrir mas não preencher são descartados automaticamente, para não poluir o calendário.

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
ainda falta tempo, preta no dia do prazo e **laranja quando atrasa**.

Um prazo muda a regra de migração: uma tarefa **concluída** que ainda tem prazo pela
frente continua aparecendo todo dia, já marcada, até chegar a data — assim ela não some
de vista e o arquivo anexado continua a um clique. Ao chegar o prazo, ela para ali.
Tarefa em aberto migra sempre, com ou sem prazo.

Como ela é só um lembrete, ela **não ocupa a vaga do template**: se a tarefa vier do
template, a cópia nova do dia é gerada do mesmo jeito, ao lado dela.

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
| `Ctrl+E` | exportar / importar |
| `Ctrl` `+` / `−` / `0` | aumenta / diminui / reseta a fonte |
| `Esc` | sai do campo em edição |
| `F12` | devtools |

## Dados

Tudo fica em `%APPDATA%\dxon-task-tracker\tracker-data.json`, gravado de forma atômica
com um backup rotativo (`tracker-data.bak.json`). Se o arquivo principal for corrompido,
o app recupera do backup e avisa. Nenhum dado sai da máquina.

**Os dados ficam fora do executável**, inclusive na versão portátil — o `.exe` só carrega
o programa. Compartilhar o executável não compartilha nenhuma tarefa, resposta ou
comentário seu. Para levar os dados de propósito, use o export json.

## Estrutura

```
electron/main.js      janela sem moldura, IPC, persistência atômica
electron/preload.js   ponte segura (contextIsolation) para dados, janela e zoom
src/store.js          modelo, geração diária, migração, planejamento futuro
src/app.js            renderização das 3 views, atalhos, diálogos
src/styles.css        design system
```

Em desenvolvimento, o console expõe `__debugSetToday('2026-07-25')`, `__debugState()` e
`__debugReset()` para simular a virada de dia sem mexer no relógio do sistema.
