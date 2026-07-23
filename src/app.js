/* Task Tracker — rendering and interaction. */

/* ---------- tiny DOM helper ---------- */

function h(tag, attrs, ...kids) {
  const n = document.createElement(tag)
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k]
      if (v === null || v === undefined || v === false) continue
      if (k === 'class') n.className = v
      else if (k === 'text') n.textContent = v
      else if (k === 'html') n.innerHTML = v
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v)
      else n.setAttribute(k, v === true ? '' : v)
    }
  }
  for (const kid of kids.flat(3)) {
    if (kid === null || kid === undefined || kid === false || kid === '') continue
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
  }
  return n
}

/* ---------- formatting ---------- */

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// num() feeds <input type=number>, which only accepts a dot.
const num = (n) => String(+Number(n || 0).toFixed(2))
// hh() is for display. Number inputs render the decimal separator of the host
// locale, so read it from there rather than assuming one.
const DECIMAL = (1.5).toLocaleString().replace(/\d/g, '')
const hh = (n) => num(n).replace('.', DECIMAL || '.')

/* ---------- app state ---------- */

const App = {
  view: 'day',
  date: null,
  calMonth: null, // 'YYYY-MM'
  openComments: new Set(),
  editingDue: null, // task id whose deadline field is open
  showFiles: false,
  isDev: false
}

const $view = document.getElementById('view')
const $meterTrack = document.getElementById('meter-track')
const $meterTotal = document.getElementById('meter-total')
const $dateMain = document.getElementById('date-main')
const $dateSub = document.getElementById('date-sub')
const $datePlate = document.getElementById('date-plate')
const $toast = document.getElementById('toast')
const $tip = document.getElementById('tip')

/* ---------- toast ---------- */

let toastTimer = null
function toast(msg) {
  $toast.textContent = msg
  $toast.classList.add('is-on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => $toast.classList.remove('is-on'), 2200)
}

/* ---------- confirm dialog (replaces native confirm) ---------- */

const $modalRoot = document.getElementById('modal-root')

function confirmDialog({ title = 'confirm', body, confirmLabel = 'confirm', cancelLabel = 'cancel', danger = false }) {
  return new Promise((resolve) => {
    const close = (answer) => {
      document.removeEventListener('keydown', onKey, true)
      $modalRoot.hidden = true
      $modalRoot.textContent = ''
      resolve(answer)
    }

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false) }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true) }
      else if (e.key === 'Tab') {
        // keep focus inside the dialog
        e.preventDefault()
        const btns = $modalRoot.querySelectorAll('.mbtn')
        const i = [...btns].indexOf(document.activeElement)
        btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus()
      }
    }

    const okBtn = h('button', {
      class: `mbtn${danger ? ' mbtn-danger' : ''}`,
      onclick: () => close(true)
    }, confirmLabel)

    $modalRoot.textContent = ''
    $modalRoot.append(
      h('div', { class: 'modal', onclick: (e) => e.stopPropagation() },
        h('div', { class: `modal-bar${danger ? ' is-danger' : ''}` },
          h('span', { class: 'modal-dot' }),
          h('span', { class: 'modal-bar-title' }, title)
        ),
        h('div', { class: 'modal-body' }, body),
        h('div', { class: 'modal-foot' },
          h('button', { class: 'mbtn', onclick: () => close(false) }, cancelLabel),
          okBtn
        )
      )
    )
    $modalRoot.onclick = () => close(false)
    $modalRoot.hidden = false
    document.addEventListener('keydown', onKey, true)
    okBtn.focus()
  })
}

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */

// Dates covered by a scope, oldest first, skipping days with nothing on them.
function scopeDates(scope) {
  const all = [...new Set(Store.state.tasks.map((k) => k.date))].sort()
  if (scope === 'day') return all.filter((d) => d === App.date)
  if (scope === 'month') return all.filter((d) => d.startsWith(App.calMonth))
  return all
}

function dayToText(date) {
  const d = Store.parse(date)
  const lines = []
  lines.push(`${date} (${DOW[d.getDay()].toUpperCase()})`)
  lines.push('='.repeat(40))

  let total = 0
  let done = 0
  let count = 0

  Store.epicsSorted().forEach((epic, i) => {
    const tasks = Store.tasksFor(epic.id, date)
    if (!tasks.length) return
    const sum = tasks.reduce((s, k) => s + (k.hours || 0), 0)
    total += sum
    lines.push('')
    lines.push(`${String(i + 1).padStart(2, '0')}  ${epic.name}  —  ${hh(sum)}h`)

    for (const task of tasks) {
      count += 1
      if (task.done) done += 1
      const box = task.done ? '[x]' : '[ ]'
      const hrs = task.hours ? `  (${hh(task.hours)}h)` : ''
      lines.push(`    ${box} ${task.title || 'untitled'}${hrs}`)
      for (const l of (task.response || '').split('\n')) {
        if (l.trim()) lines.push(`        > ${l}`)
      }
      for (const l of (task.comments || '').split('\n')) {
        if (l.trim()) lines.push(`        # ${l}`)
      }
      for (const link of task.links || []) {
        lines.push(`        @ ${link.name}  —  ${link.path}`)
      }
    }
  })

  const target = Store.state.dayTargetHours || 8
  lines.push('')
  lines.push('-'.repeat(40))
  lines.push(`TOTAL: ${hh(total)}h of ${hh(target)}h · ${done}/${count} completed`)
  return lines.join('\n')
}

function buildExport(scope, format) {
  const dates = scopeDates(scope)

  if (format === 'json') {
    const snap = Store.snapshot()
    if (scope !== 'all') {
      const keep = new Set(dates)
      snap.tasks = snap.tasks.filter((k) => keep.has(k.date))
    }
    return JSON.stringify(snap, null, 2)
  }

  if (!dates.length) return 'nothing recorded in this period.'
  return dates.map(dayToText).join('\n\n\n')
}

function exportName(scope, format) {
  const ext = format === 'json' ? 'json' : 'txt'
  if (scope === 'day') return `taskr-${App.date}.${ext}`
  if (scope === 'month') return `taskr-${App.calMonth}.${ext}`
  return `taskr-backup.${ext}`
}

function optRow(options, current, onPick) {
  const row = h('div', { class: 'opt-row' })
  for (const o of options) {
    row.append(
      h('button', {
        class: `opt${o.value === current ? ' is-on' : ''}`,
        onclick: () => onPick(o.value)
      }, o.label)
    )
  }
  return row
}

function ioDialog() {
  let scope = 'day'
  let format = 'text'

  const close = () => {
    document.removeEventListener('keydown', onKey, true)
    $modalRoot.hidden = true
    $modalRoot.textContent = ''
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
  }

  const paint = () => {
    const body = h('div', { class: 'modal-body' },
      h('div', { class: 'opt-group' },
        h('div', { class: 'opt-label' }, 'scope'),
        optRow(
          [
            { value: 'day', label: `day ${App.date.slice(8)}/${App.date.slice(5, 7)}` },
            { value: 'month', label: `month ${MON[+App.calMonth.slice(5, 7) - 1]}` },
            { value: 'all', label: 'tudo' }
          ],
          scope,
          (v) => { scope = v; paint() }
        )
      ),
      h('div', { class: 'opt-group' },
        h('div', { class: 'opt-label' }, 'format'),
        optRow(
          [
            { value: 'text', label: 'texto' },
            { value: 'json', label: 'json (backup)' }
          ],
          format,
          (v) => { format = v; paint() }
        )
      ),
      h('div', { class: 'modal-hint' },
        format === 'json'
          ? 'json keeps everything and can be imported back.'
          : 'text is read-only — it cannot be imported back.'
      ),
      h('div', { class: 'modal-sep' }),
      h('div', { class: 'opt-label' }, 'import json backup'),
      h('div', { class: 'opt-row' },
        h('button', {
          class: 'opt',
          onclick: () => { close(); runImport('merge') }
        }, 'merge'),
        h('button', {
          class: 'opt',
          onclick: () => { close(); runImport('replace') }
        }, 'replace all')
      ),
      h('div', { class: 'modal-hint' },
        'merge adds only what is missing, leaving what you already have untouched. replace swaps all of your data for the file’s.'
      )
    )

    const foot = h('div', { class: 'modal-foot' },
      h('button', { class: 'mbtn', onclick: close }, 'close'),
      h('button', {
        class: 'mbtn',
        onclick: async () => {
          await window.api.io.copy(buildExport(scope, format))
          close()
          toast('copied to clipboard')
        }
      }, 'copy'),
      h('button', {
        class: 'mbtn',
        onclick: async () => {
          const res = await window.api.io.save({
            defaultName: exportName(scope, format),
            content: buildExport(scope, format),
            kind: format
          })
          if (res.ok) { close(); toast('exported') }
          else if (res.error) toast('could not save: ' + res.error)
        }
      }, 'save...')
    )

    $modalRoot.textContent = ''
    $modalRoot.append(
      h('div', { class: 'modal', onclick: (e) => e.stopPropagation() },
        h('div', { class: 'modal-bar' },
          h('span', { class: 'modal-dot' }),
          h('span', { class: 'modal-bar-title' }, 'export / import')
        ),
        body,
        foot
      )
    )
  }

  paint()
  $modalRoot.onclick = close
  $modalRoot.hidden = false
  document.addEventListener('keydown', onKey, true)
}

async function runImport(mode) {
  const res = await window.api.io.open()
  if (!res.ok) {
    if (res.error) toast('could not open: ' + res.error)
    return
  }

  let data
  try {
    data = JSON.parse(res.raw)
  } catch (err) {
    await confirmDialog({
      title: 'invalid file',
      body: 'That file could not be read as JSON.',
      confirmLabel: 'ok',
      cancelLabel: 'close'
    })
    return
  }

  if (mode === 'replace') {
    const ok = await confirmDialog({
      title: 'replace all',
      body: `All of your current data (${Store.state.tasks.length} task(s), ${Store.state.epics.length} epic(s)) will be swapped for the file’s.\nThe previous automatic backup stays in tracker-data.bak.json.`,
      confirmLabel: 'substituir',
      danger: true
    })
    if (!ok) return
  }

  try {
    const stats = Store.importData(data, mode)
    App.date = Store.today()
    App.calMonth = App.date.slice(0, 7)
    render()
    toast(
      mode === 'replace'
        ? `imported: ${stats.tasks} task(s), ${stats.epics} epic(s)`
        : `merged: +${stats.tasks} task(s), +${stats.epics} epic(s), +${stats.templateItems} template item(s)`
    )
  } catch (err) {
    await confirmDialog({
      title: 'import failed',
      body: String(err.message || err),
      confirmLabel: 'ok',
      cancelLabel: 'close'
    })
  }
}

/* ---------- tooltip ---------- */

function bindTip(node, text) {
  node.addEventListener('mouseenter', () => {
    $tip.textContent = text
    $tip.classList.add('is-on')
  })
  node.addEventListener('mousemove', (e) => {
    $tip.style.left = Math.min(e.clientX + 12, window.innerWidth - $tip.offsetWidth - 8) + 'px'
    $tip.style.top = e.clientY - $tip.offsetHeight - 10 + 'px'
  })
  node.addEventListener('mouseleave', () => $tip.classList.remove('is-on'))
}

/* ---------- focus + scroll preservation across re-renders ---------- */

function captureFocus() {
  const a = document.activeElement
  if (!a || !a.dataset || !a.dataset.fk) return null
  return {
    fk: a.dataset.fk,
    start: a.selectionStart ?? null,
    end: a.selectionEnd ?? null
  }
}

function restoreFocus(snap) {
  if (!snap) return
  const el = $view.querySelector(`[data-fk="${CSS.escape(snap.fk)}"]`)
  if (!el) return
  el.focus()
  if (snap.start !== null && el.setSelectionRange) {
    try {
      el.setSelectionRange(snap.start, snap.end)
    } catch (err) {
      /* number inputs reject setSelectionRange — harmless */
    }
  }
}

/* ---------- auto-growing textarea ---------- */

function autoGrow(ta) {
  ta.style.height = 'auto'
  ta.style.height = ta.scrollHeight + 'px'
}

/* ============================================================
   HEADER
   ============================================================ */

function renderHeader() {
  const t = Store.today()
  const d = Store.parse(App.date)
  $dateMain.textContent = App.date
  $dateSub.textContent = DOW[d.getDay()]
  $datePlate.classList.toggle('is-today', App.date === t)
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.view === App.view)
  })
}

/* ============================================================
   FOOTER METER
   ============================================================ */

const EPIC_TONES = ['#111111', '#4a463f', '#7d7a72', '#b0ada4', '#2b2822', '#63605a']

function epicTone(index) {
  return EPIC_TONES[index % EPIC_TONES.length]
}

function renderMeter() {
  const epics = Store.epicsSorted()
  const target = Store.state.dayTargetHours || 8
  $meterTrack.textContent = ''

  const filled = []
  let total = 0

  epics.forEach((epic, ei) => {
    const blocks = Store.tasksFor(epic.id, App.date).filter((k) => (k.hours || 0) > 0)
    // loose epic time rides alongside the tasks rather than replacing them
    const extra = Store.epicExtra(epic.id, App.date)
    if (extra > 0) blocks.unshift({ hours: extra, title: 'epic time', isExtra: true })
    if (!blocks.length) return

    filled.push({ epic, ei, tasks: blocks })
    for (const b of blocks) total += b.hours
  })

  // The bar is scaled to the target; going over stretches it to the total instead,
  // and an orange mark shows where the target was crossed.
  const span = Math.max(target, total)
  const pct = (hours) => (hours / span) * 100

  let acc = 0
  let markPlaced = total <= target

  filled.forEach(({ epic, ei, tasks }, gi) => {
    if (gi > 0) $meterTrack.append(h('div', { class: 'seg is-gap' }))
    for (const task of tasks) {
      // drop the target mark at the exact point the day tips over
      if (!markPlaced && acc + task.hours > target) {
        const before = target - acc
        if (before > 0.001) {
          $meterTrack.append(h('div', {
            class: 'seg',
            style: `width: ${pct(before)}%; flex: none; background: ${epicTone(ei)}`
          }))
        }
        $meterTrack.append(h('div', { class: 'meter-mark' }))
        const after = task.hours - Math.max(0, before)
        const seg = h('div', {
          class: 'seg',
          style: `width: ${pct(after)}%; flex: none; background: ${epicTone(ei)}`
        })
        bindTip(seg, `${epic.name} / ${task.title || 'untitled'} / ${hh(task.hours)}h`)
        $meterTrack.append(seg)
        markPlaced = true
        acc += task.hours
        continue
      }

      const seg = h('div', {
        class: 'seg',
        style: `width: ${pct(task.hours)}%; flex: none; background: ${epicTone(ei)}`
      })
      bindTip(seg, `${epic.name} / ${task.title || 'untitled'} / ${hh(task.hours)}h`)
      $meterTrack.append(seg)
      acc += task.hours
    }
  })

  $meterTotal.textContent = hh(total)
  $meterTotal.parentElement.classList.toggle('is-over', total > target)
  $meterTotal.parentElement.title =
    total > target
      ? `${hh(total - target)}h over the ${hh(target)}h target`
      : `${hh(target - total)}h left to reach the ${hh(target)}h target`
  document.getElementById('target-val').textContent = hh(target)
}

/* ============================================================
   DAY VIEW
   ============================================================ */

function hoursStepper(task, onChange) {
  const input = h('input', {
    class: 'hours-in',
    type: 'number',
    step: '0.5',
    min: '0',
    max: '24',
    value: num(task.hours),
    'data-fk': `hours:${task.id}`,
    oninput: (e) => {
      const v = parseFloat(e.target.value)
      onChange(Number.isFinite(v) ? Math.min(24, Math.max(0, v)) : 0)
    },
    onblur: (e) => {
      const v = parseFloat(e.target.value)
      const clean = Number.isFinite(v) ? Math.min(24, Math.max(0, Math.round(v * 4) / 4)) : 0
      e.target.value = num(clean)
      onChange(clean)
    }
  })

  const bump = (delta) => {
    const v = Math.min(24, Math.max(0, (parseFloat(input.value) || 0) + delta))
    input.value = num(v)
    onChange(v)
  }

  return h(
    'div',
    { class: 'hours' },
    h('button', { class: 'hours-btn', title: 'Less 0.5h', onclick: () => bump(-0.5) }, '−'),
    input,
    h('span', { class: 'hours-unit' }, 'h'),
    h('button', { class: 'hours-btn', title: 'More 0.5h', onclick: () => bump(0.5) }, '+')
  )
}

function fieldRow(kind, task, value, placeholder, mark) {
  const ta = h('textarea', {
    class: 'field-in',
    rows: '1',
    placeholder,
    'data-fk': `${kind}:${task.id}`,
    oninput: (e) => {
      autoGrow(e.target)
      Store.commit((s) => {
        const k = s.tasks.find((x) => x.id === task.id)
        if (k) k[kind] = e.target.value
      }, { silent: true })
      syncCommentFlag(task.id)
    }
  })
  ta.value = value || ''
  requestAnimationFrame(() => autoGrow(ta))

  return h('div', { class: `field field-${kind === 'response' ? 'response' : 'comments'}` },
    h('span', { class: 'field-mark' }, mark),
    ta
  )
}

/* ---------- folder / file links ---------- */

async function openTarget(target) {
  const res = await window.api.link.open(target)
  if (!res.ok) toast('could not open: ' + (res.error || 'error'))
}

// Compact display path: last two segments are enough to recognise a folder.
function shortPath(p) {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? p : '…' + parts.slice(-2).join('\\')
}

async function pickEpicFolder(epicId) {
  const epic = Store.epicById(epicId)
  const res = await window.api.link.pickFolder(epic && epic.folder)
  if (!res.ok) return
  Store.updateEpic(epicId, { folder: res.path })
  render()
  toast('folder linked')
}

// Set: a shortcut that opens the folder. Unset: a "+" that links one.
function epicFolderButton(epic) {
  if (!epic.folder) {
    const add = h('button', {
      class: 'folder-btn is-unset',
      title: 'Link a folder to this epic',
      onclick: () => pickEpicFolder(epic.id)
    }, '+')
    bindTip(add, 'link a folder')
    return add
  }
  const btn = h('button', {
    class: 'folder-btn',
    onclick: () => openTarget(epic.folder)
  }, '▸', h('span', { class: 'folder-path' }, shortPath(epic.folder)))
  bindTip(btn, `abrir ${epic.folder}`)
  return btn
}

function linksRow(task) {
  if (!task.links.length) return null
  const row = h('div', { class: 'links' })
  for (const link of task.links) {
    const chip = h('span', { class: 'chip', onclick: () => openTarget(link.path) },
      h('span', { class: 'chip-name' }, link.name),
      h('button', {
        class: 'chip-x',
        title: 'Unlink',
        onclick: (e) => {
          e.stopPropagation()
          Store.removeTaskLink(task.id, link.path)
          render()
        }
      }, '✕')
    )
    bindTip(chip, link.path)
    row.append(chip)
  }
  return row
}

async function attachFiles(taskId) {
  // start the picker inside the epic's folder when there is one
  const task = Store.taskById(taskId)
  const epic = task && Store.epicById(task.epicId)
  const res = await window.api.link.pickFiles(epic && epic.folder)
  if (!res.ok) return
  const added = Store.addTaskLinks(taskId, res.files)
  render()
  toast(added ? `${added} file(s) linked` : 'already linked')
}

// Keeps the "#" button lit when the comment holds text, without a full re-render.
function syncCommentFlag(taskId) {
  const btn = $view.querySelector(`[data-cbtn="${CSS.escape(taskId)}"]`)
  if (!btn) return
  const task = Store.taskById(taskId)
  btn.classList.toggle('has-content', !!(task && task.comments.trim()))
}

/* ---------- deadline ---------- */

function dueField(task) {
  const t = Store.today()

  if (App.editingDue === task.id) {
    return h('input', {
      class: 'due',
      type: 'date',
      value: task.dueDate || '',
      'data-fk': `due:${task.id}`,
      onchange: (e) => {
        Store.updateTask(task.id, { dueDate: e.target.value || null })
        App.editingDue = null
        render()
      },
      onblur: () => {
        if (App.editingDue !== task.id) return
        App.editingDue = null
        render()
      }
    })
  }

  const open = () => { App.editingDue = task.id; render() }

  if (!task.dueDate) {
    const btn = h('button', { class: 'due is-unset', onclick: open }, '+ due')
    bindTip(btn, 'set a deadline')
    return btn
  }

  const late = t > task.dueDate
  const soon = task.dueDate === t
  const btn = h('button', {
    class: `due${late ? ' is-late' : soon ? ' is-soon' : ''}`,
    onclick: open
  }, `due ${task.dueDate.slice(5)}`)
  bindTip(
    btn,
    late ? `overdue since ${task.dueDate}` : soon ? 'due today' : `due on ${task.dueDate}`
  )
  return btn
}

function renderTask(task, epic) {
  const t = Store.today()
  const rolled = Store.daysBetween(task.createdDate, task.date)
  const commentsOpen = App.openComments.has(task.id) || !!task.comments.trim()

  const node = h('div', {
    class: [
      'task',
      task.done ? 'is-done' : '',
      task.carriedTo ? 'is-carried' : '',
      (task.hours || 0) === 0 ? 'is-zero' : '',
      commentsOpen ? 'is-open' : ''
    ].filter(Boolean).join(' '),
    'data-task': task.id
  })

  const check = h('button', {
    class: `check${task.done ? ' is-done' : ''}`,
    title: 'Complete (ctrl+enter)',
    onclick: () => {
      const r = Store.toggleTask(task.id)
      if (r === 'pulled') {
        toast('reopened and pulled to today')
        App.date = t
      }
      render()
    }
  })
  check.innerHTML =
    '<svg viewBox="0 0 10 10" fill="none" stroke-width="2" stroke-linecap="square"><path d="M1.5 5.2 L4 7.5 L8.5 2.5"/></svg>'

  const title = h('input', {
    class: 'title-in',
    type: 'text',
    value: task.title,
    placeholder: 'untitled',
    'data-fk': `title:${task.id}`,
    size: Math.max(8, (task.title || 'untitled').length + 1),
    oninput: (e) => {
      e.target.size = Math.max(8, e.target.value.length + 1)
      Store.commit((s) => {
        const k = s.tasks.find((x) => x.id === task.id)
        if (k) k.title = e.target.value
      }, { silent: true })
    }
  })

  const commentBtn = h('button', {
    class: `act${task.comments.trim() ? ' has-content' : ''}${commentsOpen ? ' is-on' : ''}`,
    title: 'Comment',
    'data-cbtn': task.id,
    onclick: () => {
      if (App.openComments.has(task.id)) App.openComments.delete(task.id)
      else App.openComments.add(task.id)
      render()
      const ta = $view.querySelector(`[data-fk="comments:${CSS.escape(task.id)}"]`)
      if (ta) ta.focus()
    }
  }, '#')

  const line = h('div', { class: 'task-line' },
    check,
    title,
    rolled >= 2 ? h('span', { class: 'badge', title: `carried for ${rolled} days` }, `↻${rolled}d`) : null,
    // this row is the record of a past day; the work itself went on to the next one
    task.carriedTo
      ? h('span', { class: 'badge badge-carried', title: 'unfinished — continued on the next day' }, '↷')
      : null,
    h('div', { class: 'leader' }),
    dueField(task),
    hoursStepper(task, (v) => {
      Store.commit((s) => {
        const k = s.tasks.find((x) => x.id === task.id)
        if (k) k.hours = v
      }, { silent: true })
      node.classList.toggle('is-zero', v === 0)
      renderMeter()
      updateEpicHours(epic.id)
    }),
    h('div', { class: 'acts' },
      commentBtn,
      h('button', {
        class: `act${task.links.length ? ' has-content' : ''}`,
        title: 'Link a file',
        onclick: () => attachFiles(task.id)
      }, '@'),
      h('button', {
        class: 'act',
        title: 'Move up',
        onclick: () => { Store.moveTask(task.id, -1); render() }
      }, '▲'),
      h('button', {
        class: 'act',
        title: 'Move down',
        onclick: () => { Store.moveTask(task.id, 1); render() }
      }, '▼'),
      h('button', {
        class: 'act act-danger',
        title: 'Delete task',
        onclick: async () => {
          // an untouched blank row is not worth a confirmation
          const untouched = !task.title.trim() && !task.response.trim() && !task.comments.trim() && !task.hours
          if (!untouched) {
            const ok = await confirmDialog({
              title: 'delete task',
              body: `"${task.title.trim() || 'untitled'}" will be removed from this day.\nThis cannot be undone.`,
              confirmLabel: 'delete',
              danger: true
            })
            if (!ok) return
          }
          Store.removeTask(task.id)
          render()
        }
      }, '✕')
    )
  )

  node.append(line)
  node.append(fieldRow('response', task, task.response, 'what was done, and how', '>'))
  if (commentsOpen) node.append(fieldRow('comments', task, task.comments, 'comment', '#'))
  const links = linksRow(task)
  if (links) node.append(links)

  return node
}

// Refresh the epic's total after task hours change, without a full re-render.
function updateEpicHours(epicId) {
  const el = $view.querySelector(`[data-etotal="${CSS.escape(epicId)}"]`)
  if (!el) return
  el.textContent = hh(Store.epicTotal(epicId, App.date))
}

// Two numbers: loose time booked on the epic, and the epic's grand total.
// The total is always extra + tasks, so task hours land in the epic's count.
function epicHoursControl(epic) {
  const extra = Store.epicExtra(epic.id, App.date)

  const totalEl = h('b', { 'data-etotal': epic.id }, hh(Store.epicTotal(epic.id, App.date)))

  const sync = () => {
    totalEl.textContent = hh(Store.epicTotal(epic.id, App.date))
    renderMeter()
  }

  const input = h('input', {
    class: 'epic-hours-in',
    type: 'number',
    step: '0.5',
    min: '0',
    max: '24',
    value: num(extra),
    'data-fk': `ehours:${epic.id}`,
    title: 'hours booked on the epic itself, for work that belongs to no single task',
    oninput: (e) => {
      const v = parseFloat(e.target.value)
      Store.setEpicExtra(epic.id, App.date, Number.isFinite(v) ? v : 0)
      wrap.classList.toggle('has-extra', (parseFloat(e.target.value) || 0) > 0)
      sync()
    }
  })

  const bump = (delta) => {
    const v = Math.min(24, Math.max(0, (parseFloat(input.value) || 0) + delta))
    input.value = num(v)
    Store.setEpicExtra(epic.id, App.date, v)
    wrap.classList.toggle('has-extra', v > 0)
    sync()
  }

  const wrap = h('div', { class: `epic-extra${extra > 0 ? ' has-extra' : ''}` },
    h('span', { class: 'epic-extra-label' }, 'epic'),
    h('button', { class: 'hours-btn', title: 'Less 0.5h', onclick: () => bump(-0.5) }, '−'),
    input,
    h('span', { class: 'hours-unit' }, 'h'),
    h('button', { class: 'hours-btn', title: 'More 0.5h', onclick: () => bump(0.5) }, '+')
  )
  bindTip(wrap, 'time on the epic itself — task hours are added on top')

  return h('span', { class: 'epic-total-group' },
    wrap,
    h('span', { class: 'epic-hours' }, totalEl, 'h')
  )
}

function renderDay() {
  const t = Store.today()
  const pane = h('div', { class: 'pane' })
  const epics = Store.epicsSorted()
  const editable = App.date >= t

  if (!epics.length) {
    pane.append(h('div', { class: 'empty' }, 'no epics — create one in the tmplt tab'))
    return pane
  }
  if (!Store.tasksOn(App.date).length && !editable) {
    pane.append(h('div', { class: 'empty' }, 'nothing recorded on this day'))
    return pane
  }

  if (App.date > t) {
    const ahead = Store.daysBetween(t, App.date)
    pane.append(
      h('div', { class: 'note' },
        `planning — ${ahead} day(s) ahead. anything left open today still rolls over into this day`
      )
    )
  }

  let shown = 0
  epics.forEach((epic, i) => {
    const tasks = Store.tasksFor(epic.id, App.date)
    // Past days only list what actually happened; today and future days show every
    // epic so tasks can be added to any of them.
    if (!tasks.length && !editable) return
    shown += 1

    const done = tasks.filter((k) => k.done).length

    const section = h('section', { class: 'epic' },
      h('div', { class: 'epic-head' },
        h('span', { class: 'epic-idx' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'epic-name' }, epic.name),
        epicFolderButton(epic),
        h('span', { class: 'epic-rule' }),
        h('span', { class: 'epic-count' }, tasks.length ? `${done}/${tasks.length}` : ''),
        epicHoursControl(epic)
      )
    )

    for (const task of tasks) section.append(renderTask(task, epic))

    if (editable) {
      section.append(
        h('div', { class: 'add-row' },
          h('button', {
            class: 'add-btn',
            onclick: () => {
              const task = Store.addTask(epic.id, App.date, '')
              render()
              const el = $view.querySelector(`[data-fk="title:${CSS.escape(task.id)}"]`)
              if (el) el.focus()
            }
          }, '+ task')
        )
      )
    }

    pane.append(section)
  })

  if (!shown) pane.append(h('div', { class: 'empty' }, 'no tasks on this day'))
  return pane
}

/* ============================================================
   SIDEBAR — files already linked anywhere
   ============================================================ */

const $sidebar = document.getElementById('sidebar')

function renderSidebar() {
  $sidebar.hidden = !App.showFiles
  document.getElementById('btn-files').classList.toggle('is-active', App.showFiles)
  if (!App.showFiles) return

  $sidebar.textContent = ''
  $sidebar.append(h('div', { class: 'side-title' }, 'linked files'))

  const links = Store.allLinks()
  const epics = Store.epicsSorted()
  let shown = 0

  for (const epic of epics) {
    const mine = links.filter((l) => l.epicId === epic.id)
    if (!mine.length && !epic.folder) continue
    shown += 1

    const group = h('div', { class: 'side-group' },
      h('div', { class: 'side-epic' }, epic.name)
    )

    if (epic.folder) {
      const btn = h('button', {
        class: 'side-file',
        onclick: () => openTarget(epic.folder)
      },
        '▸ ' + shortPath(epic.folder),
        h('span', { class: 'side-sub' }, 'epic folder')
      )
      bindTip(btn, epic.folder)
      group.append(btn)
    }

    for (const link of mine) {
      const btn = h('button', {
        class: 'side-file',
        onclick: () => openTarget(link.path)
      },
        link.name,
        h('span', { class: 'side-sub' }, `${link.date} · ${link.taskTitle || 'untitled'}`)
      )
      bindTip(btn, link.path)
      group.append(btn)
    }

    $sidebar.append(group)
  }

  if (!shown) {
    $sidebar.append(h('div', { class: 'empty', style: 'margin-top:24px' }, 'nothing linked yet'))
  }
}

/* ============================================================
   SEARCH — one field over epics, tasks and files
   ============================================================ */

const $search = document.getElementById('search')
const $searchIn = document.getElementById('search-in')
const $searchPanel = document.getElementById('search-panel')

let searchTimer = null

function openSearch() {
  $search.classList.add('is-open')
  $searchIn.tabIndex = 0
  $searchIn.focus()
  $searchIn.select()
}

function closeSearch() {
  $search.classList.remove('is-open')
  $searchIn.tabIndex = -1
  $searchIn.value = ''
  $searchPanel.hidden = true
  $searchPanel.textContent = ''
}

// Lands on the day the task lives on and lights the row up for a moment,
// so the eye finds it without hunting.
function jumpToTask(task) {
  closeSearch()
  App.view = 'day'
  goDate(task.date)
  requestAnimationFrame(() => {
    const row = $view.querySelector(`[data-task="${CSS.escape(task.id)}"]`)
    if (!row) return
    row.scrollIntoView({ block: 'center' })
    row.classList.add('is-hit')
    setTimeout(() => row.classList.remove('is-hit'), 1400)
  })
}

function jumpToEpic(epic) {
  closeSearch()
  App.view = 'day'
  render()
  requestAnimationFrame(() => {
    const heads = [...$view.querySelectorAll('.epic-name')]
    const head = heads.find((n) => n.textContent === epic.name)
    if (!head) return
    head.scrollIntoView({ block: 'center' })
    const section = head.closest('.epic')
    if (!section) return
    section.classList.add('is-hit')
    setTimeout(() => section.classList.remove('is-hit'), 1400)
  })
}

function resultRow(kind, label, sub, onPick) {
  return h('button', { class: 'sr', onclick: onPick },
    h('span', { class: 'sr-kind' }, kind),
    h('span', { class: 'sr-main' }, label),
    h('span', { class: 'sr-sub' }, sub || '')
  )
}

function renderSearch() {
  const q = $searchIn.value
  const res = Store.search(q)

  $searchPanel.textContent = ''

  if (q.trim().length < 2) {
    $searchPanel.hidden = true
    return
  }

  if (!res.total) {
    $searchPanel.append(h('div', { class: 'sr-empty' }, `nothing matches "${res.query}"`))
    $searchPanel.hidden = false
    return
  }

  if (res.epics.length) {
    $searchPanel.append(h('div', { class: 'sr-head' }, 'epics'))
    for (const epic of res.epics) {
      $searchPanel.append(resultRow('EP', epic.name, '', () => jumpToEpic(epic)))
    }
  }

  if (res.tasks.length) {
    $searchPanel.append(h('div', { class: 'sr-head' }, 'tasks'))
    for (const r of res.tasks) {
      const marks = [r.task.done ? '✓' : '', r.task.carriedTo ? '↷' : ''].filter(Boolean).join(' ')
      $searchPanel.append(
        resultRow(
          r.task.date === Store.today() ? 'TODAY' : r.task.date.slice(5),
          r.task.title || 'untitled',
          [r.epicName, r.excerpt, marks].filter(Boolean).join('  ·  '),
          () => jumpToTask(r.task)
        )
      )
    }
  }

  if (res.files.length) {
    $searchPanel.append(h('div', { class: 'sr-head' }, 'files'))
    for (const f of res.files) {
      $searchPanel.append(
        resultRow(f.isFolder ? 'DIR' : '@', f.name, f.sub, () => { closeSearch(); openTarget(f.path) })
      )
    }
  }

  $searchPanel.hidden = false
}

document.getElementById('btn-search').onclick = () => {
  if ($search.classList.contains('is-open')) closeSearch()
  else openSearch()
}
document.getElementById('search-x').onclick = closeSearch

$searchIn.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(renderSearch, 90)
})

$searchIn.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closeSearch()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const first = $searchPanel.querySelector('.sr')
    if (first) first.click()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    const first = $searchPanel.querySelector('.sr')
    if (first) first.focus()
  }
})

// arrow keys walk the result list once it has focus
$searchPanel.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Escape') return
  e.preventDefault()
  if (e.key === 'Escape') { closeSearch(); return }
  const rows = [...$searchPanel.querySelectorAll('.sr')]
  const i = rows.indexOf(document.activeElement)
  const j = i + (e.key === 'ArrowDown' ? 1 : -1)
  if (j < 0) $searchIn.focus()
  else if (rows[j]) rows[j].focus()
})

// clicking anywhere else puts the search away
document.addEventListener('mousedown', (e) => {
  if (!$search.classList.contains('is-open')) return
  if (e.target.closest('#search') || e.target.closest('#search-panel')) return
  closeSearch()
})

/* ============================================================
   NOTES DRAWER — one note per day, one .txt per day on disk
   ============================================================ */

const Notes = (() => {
  const $drawer = document.getElementById('drawer')
  const $in = document.getElementById('note-in')
  const $date = document.getElementById('note-date')
  const $dow = document.getElementById('note-dow')
  const $plate = document.getElementById('note-plate')
  const $state = document.getElementById('note-state')
  const $path = document.getElementById('note-path')
  const $dot = document.getElementById('notes-dot')
  const $btn = document.getElementById('btn-notes')

  const SAVE_MS = 500

  let date = null
  let dirty = false
  let timer = null
  let dates = new Set()
  let dataDir = ''

  function setState(txt) {
    $state.textContent = txt
  }

  async function refreshDates() {
    dates = new Set(await window.api.notes.dates())
    $dot.hidden = !dates.has(Store.today())
    paintPlate()
  }

  function paintPlate() {
    if (!date) return
    $date.textContent = date
    $dow.textContent = DOW[Store.parse(date).getDay()]
    $plate.classList.toggle('is-today', date === Store.today())
    $path.textContent = dataDir ? `${dataDir}\\notes\\${date}.txt` : ''
  }

  async function load(d) {
    await flush()
    date = d
    paintPlate()
    const res = await window.api.notes.read(d)
    $in.value = res.text || ''
    dirty = false
    setState(res.text ? '' : 'empty')
  }

  function schedule() {
    dirty = true
    setState('…')
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_MS)
  }

  async function flush() {
    clearTimeout(timer)
    timer = null
    if (!dirty || !date) return
    const target = date
    const text = $in.value
    dirty = false
    const res = await window.api.notes.write(target, text)
    if (!res.ok) {
      setState('save failed')
      toast('could not save the note: ' + (res.error || 'error'))
      return
    }
    if (text.trim()) dates.add(target)
    else dates.delete(target)
    $dot.hidden = !dates.has(Store.today())
    if (date === target) setState('saved')
  }

  async function open(d) {
    $drawer.hidden = false
    // one frame with the drawer laid out but still down, so the slide animates
    requestAnimationFrame(() => $drawer.classList.add('is-open'))
    $btn.classList.add('is-active')
    await load(d || date || App.date)
    $in.focus()
  }

  async function close() {
    await flush()
    $drawer.classList.remove('is-open')
    $btn.classList.remove('is-active')
    // wait out the slide before pulling it from the layout
    setTimeout(() => {
      if (!$drawer.classList.contains('is-open')) $drawer.hidden = true
    }, 200)
  }

  function toggle() {
    if ($drawer.classList.contains('is-open')) close()
    else open(App.date)
  }

  // Carries this day's note into today's, appending under a dated rule rather
  // than overwriting whatever is already there.
  async function takeToToday() {
    const t = Store.today()
    const text = $in.value.trim()
    if (!text) { toast('this note is empty'); return }
    if (date === t) { toast('already on today'); return }

    await flush()
    const res = await window.api.notes.read(t)
    const current = (res.text || '').trim()
    const merged = current ? `${current}\n\n--- from ${date} ---\n${text}\n` : `${text}\n`
    const w = await window.api.notes.write(t, merged)
    if (!w.ok) { toast('could not write today’s note'); return }
    dates.add(t)
    await load(t)
    setState('saved')
    $dot.hidden = false
    toast('note taken to today')
  }

  $in.addEventListener('input', schedule)
  $in.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
  })

  document.getElementById('note-prev').onclick = () => load(Store.addDays(date, -1))
  document.getElementById('note-next').onclick = () => load(Store.addDays(date, 1))
  $plate.onclick = () => load(Store.today())
  document.getElementById('note-close').onclick = close
  document.getElementById('note-to-today').onclick = takeToToday
  $btn.onclick = toggle

  return {
    toggle,
    close,
    flush,
    isOpen: () => $drawer.classList.contains('is-open'),
    async boot() {
      dataDir = await window.api.dataDir()
      date = Store.today()
      paintPlate()
      await refreshDates()
    }
  }
})()

/* ============================================================
   CALENDAR VIEW
   ============================================================ */

function monthShift(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function renderCal() {
  const t = Store.today()
  const ym = App.calMonth
  const [y, m] = ym.split('-').map(Number)
  const pane = h('div', { class: 'pane' })

  const head = h('div', { class: 'cal-head' },
    h('button', { class: 'sq', title: 'Previous month', onclick: () => { App.calMonth = monthShift(ym, -1); render() } }, '◀'),
    h('button', { class: 'sq', title: 'Next month', onclick: () => { App.calMonth = monthShift(ym, 1); render() } }, '▶'),
    h('span', { class: 'cal-title' }, `${MON[m - 1]} ${y}`),
    h('span', { class: 'cal-spacer' }),
    h('span', { class: 'cal-legend' }, 'hours / tasks done')
  )
  pane.append(head)

  const grid = h('div', { class: 'cal-grid' })
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    grid.append(h('div', { class: 'cal-dow' }, d))
  }

  const firstOfMonth = new Date(y, m - 1, 1)
  // grid runs monday-first: shift Sunday (0) to the end of the week
  const lead = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(y, m, 0).getDate()

  for (let i = 0; i < lead; i++) grid.append(h('div', { class: 'cal-cell is-blank' }))

  let monthHours = 0
  let monthDone = 0
  let workedDays = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const stats = Store.dayStats(date)
    const dow = new Date(y, m - 1, day).getDay()

    monthHours += stats.hours
    monthDone += stats.done
    if (stats.hours > 0) workedDays += 1

    const cell = h('button', {
      class: [
        'cal-cell',
        dow === 0 || dow === 6 ? 'is-weekend' : '',
        date === t ? 'is-today' : '',
        date === App.date ? 'is-sel' : '',
        date > t ? 'is-future' : ''
      ].filter(Boolean).join(' '),
      onclick: () => {
        App.view = 'day'
        goDate(date)
      }
    },
      h('span', { class: 'cal-num' }, String(day).padStart(2, '0')),
      h('div', { class: 'cal-body' },
        stats.total
          ? h('div', { class: 'cal-pips' },
              Array.from({ length: Math.min(stats.total, 12) }, (_, i) =>
                h('span', { class: `pip${i < stats.done ? ' is-done' : ''}` })
              )
            )
          : null,
        stats.hours > 0 ? h('span', { class: 'cal-hours' }, `${hh(stats.hours)}h`) : null
      )
    )

    if (stats.total) bindTip(cell, `${hh(stats.hours)}h / ${stats.done} of ${stats.total} completed`)
    grid.append(cell)
  }

  pane.append(grid)

  pane.append(
    h('div', { class: 'cal-sum' },
      h('div', { class: 'sum-item' },
        h('span', { class: 'sum-k' }, 'hours this month'),
        h('span', { class: 'sum-v' }, `${hh(monthHours)}h`)
      ),
      h('div', { class: 'sum-item' },
        h('span', { class: 'sum-k' }, 'days with entries'),
        h('span', { class: 'sum-v' }, String(workedDays))
      ),
      h('div', { class: 'sum-item' },
        h('span', { class: 'sum-k' }, 'tasks completed'),
        h('span', { class: 'sum-v' }, String(monthDone))
      ),
      h('div', { class: 'sum-item' },
        h('span', { class: 'sum-k' }, 'average per active day'),
        h('span', { class: 'sum-v' }, workedDays ? `${hh(monthHours / workedDays)}h` : '—')
      )
    )
  )

  return pane
}

/* ============================================================
   TEMPLATE VIEW
   ============================================================ */

function renderTpl() {
  const pane = h('div', { class: 'pane' })
  const epics = Store.epicsSorted()

  pane.append(
    h('div', { class: 'tpl-head' },
      h('span', { class: 'tpl-title' }, 'daily template'),
      h('span', { class: 'cal-spacer' }),
      h('button', {
        class: 'add-btn',
        onclick: () => {
          const epic = Store.addEpic('NOVO EPICO')
          render()
          const el = $view.querySelector(`[data-fk="epic:${CSS.escape(epic.id)}"]`)
          if (el) { el.focus(); el.select() }
        }
      }, '+ epic')
    )
  )

  pane.append(
    h('div', { class: 'note' },
      'changes here apply from the next daily generation — today’s list stays as it is'
    )
  )

  if (!epics.length) {
    pane.append(h('div', { class: 'empty' }, 'no epics yet'))
    return pane
  }

  epics.forEach((epic, i) => {
    const items = Store.templateItemsFor(epic.id)
    const sum = items.reduce((s, it) => s + (it.defaultHours || 0), 0)

    const section = h('section', { class: 'epic' },
      h('div', { class: 'epic-head' },
        h('span', { class: 'epic-idx' }, String(i + 1).padStart(2, '0')),
        h('input', {
          class: 'epic-name-in',
          type: 'text',
          value: epic.name,
          'data-fk': `epic:${epic.id}`,
          size: Math.max(10, epic.name.length + 1),
          oninput: (e) => {
            e.target.size = Math.max(10, e.target.value.length + 1)
            Store.commit((s) => {
              const x = s.epics.find((k) => k.id === epic.id)
              if (x) x.name = e.target.value
            }, { silent: true })
          }
        }),
        h('span', { class: 'epic-rule' }),
        epic.folder
          ? h('button', {
              class: 'folder-btn',
              title: `${epic.folder}\n(clique para abrir)`,
              onclick: () => openTarget(epic.folder)
            }, '▸', h('span', { class: 'folder-path' }, shortPath(epic.folder)))
          : null,
        h('button', {
          class: `folder-btn${epic.folder ? '' : ' is-unset'}`,
          title: epic.folder ? 'Change folder' : 'Link a folder to this epic',
          onclick: () => pickEpicFolder(epic.id)
        }, epic.folder ? 'change' : '+ folder'),
        epic.folder
          ? h('button', {
              class: 'folder-btn',
              title: 'Unlink folder',
              onclick: () => { Store.updateEpic(epic.id, { folder: null }); render() }
            }, '✕')
          : null,
        h('span', { class: 'epic-hours' }, h('b', null, hh(sum)), 'h'),
        h('div', { class: 'acts', style: 'opacity:1' },
          h('button', { class: 'act', title: 'Move up', onclick: () => { Store.moveEpic(epic.id, -1); render() } }, '▲'),
          h('button', { class: 'act', title: 'Move down', onclick: () => { Store.moveEpic(epic.id, 1); render() } }, '▼'),
          h('button', {
            class: 'act act-danger',
            title: 'Delete epic',
            onclick: async () => {
              const n = Store.state.tasks.filter((k) => k.epicId === epic.id).length
              const ok = await confirmDialog({
                title: 'delete epic',
                body: `"${epic.name}" will be removed along with ${items.length} template item(s) and ${n} recorded task(s), across every day.\nThis cannot be undone.`,
                confirmLabel: 'delete everything',
                danger: true
              })
              if (ok) { Store.removeEpic(epic.id); render() }
            }
          }, '✕')
        )
      )
    )

    for (const item of items) {
      section.append(
        h('div', { class: 'tpl-item' },
          h('span', { class: 'tpl-bullet' }, '•'),
          h('input', {
            class: 'title-in',
            type: 'text',
            value: item.title,
            placeholder: 'task name',
            'data-fk': `tpl:${item.id}`,
            size: Math.max(8, (item.title || 'task name').length + 1),
            oninput: (e) => {
              e.target.size = Math.max(8, e.target.value.length + 1)
              Store.commit((s) => {
                const x = s.templateItems.find((k) => k.id === item.id)
                if (x) x.title = e.target.value
              }, { silent: true })
            }
          }),
          h('div', { class: 'leader' }),
          h('div', { class: 'hours' },
            h('input', {
              class: 'hours-in',
              type: 'number',
              step: '0.5',
              min: '0',
              max: '24',
              value: num(item.defaultHours),
              'data-fk': `tplh:${item.id}`,
              title: 'Suggested hours (reference only)',
              oninput: (e) => {
                const v = parseFloat(e.target.value)
                Store.commit((s) => {
                  const x = s.templateItems.find((k) => k.id === item.id)
                  if (x) x.defaultHours = Number.isFinite(v) ? Math.min(24, Math.max(0, v)) : 0
                }, { silent: true })
              }
            }),
            h('span', { class: 'hours-unit' }, 'h')
          ),
          h('div', { class: 'acts', style: 'opacity:1' },
            h('button', { class: 'act', title: 'Move up', onclick: () => { Store.moveTemplateItem(item.id, -1); render() } }, '▲'),
            h('button', { class: 'act', title: 'Move down', onclick: () => { Store.moveTemplateItem(item.id, 1); render() } }, '▼'),
            h('button', {
              class: 'act act-danger',
              title: 'Remove from template',
              onclick: () => { Store.removeTemplateItem(item.id); render() }
            }, '✕')
          )
        )
      )
    }

    section.append(
      h('div', { class: 'add-row' },
        h('button', {
          class: 'add-btn',
          onclick: () => {
            const item = Store.addTemplateItem(epic.id, '', 0)
            render()
            const el = $view.querySelector(`[data-fk="tpl:${CSS.escape(item.id)}"]`)
            if (el) el.focus()
          }
        }, '+ item')
      )
    )

    pane.append(section)
  })

  return pane
}

/* ============================================================
   RENDER
   ============================================================ */

function render() {
  const snap = captureFocus()
  const scroll = $view.scrollTop

  renderHeader()
  $view.textContent = ''
  $view.classList.toggle('is-tpl', App.view === 'tpl')
  if (App.view === 'day') $view.append(renderDay())
  else if (App.view === 'cal') $view.append(renderCal())
  else $view.append(renderTpl())

  renderSidebar()
  renderMeter()
  $view.scrollTop = scroll
  restoreFocus(snap)
}

/* ============================================================
   NAVIGATION + SHORTCUTS
   ============================================================ */

function goDate(date) {
  // Landing on a future day builds it from the template so it can be planned.
  Store.planDay(date)
  App.date = date
  App.calMonth = date.slice(0, 7)
  render()
}

function setView(v) {
  App.view = v
  render()
}

document.getElementById('prev-day').onclick = () => goDate(Store.addDays(App.date, -1))
document.getElementById('next-day').onclick = () => goDate(Store.addDays(App.date, 1))
document.getElementById('date-plate').onclick = () => goDate(Store.today())

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab')
  if (btn) setView(btn.dataset.view)
})

document.getElementById('btn-io').onclick = ioDialog

document.getElementById('btn-files').onclick = () => {
  App.showFiles = !App.showFiles
  renderSidebar()
}

document.getElementById('font-minus').onclick = () => stepZoom(-1)
document.getElementById('font-plus').onclick = () => stepZoom(1)

const bumpTarget = (delta) => {
  Store.setDayTarget((Store.state.dayTargetHours || 8) + delta)
  renderMeter()
}
document.getElementById('target-minus').onclick = () => bumpTarget(-0.5)
document.getElementById('target-plus').onclick = () => bumpTarget(0.5)

function isTyping(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/* ---------- window controls ---------- */

document.getElementById('win-min').onclick = () => window.api.win.minimize()
document.getElementById('win-max').onclick = () => window.api.win.toggleMaximize()
document.getElementById('win-close').onclick = () => window.api.win.close()

window.api.win.onMaximizeChange((isMax) => {
  document.getElementById('app').classList.toggle('is-max', isMax)
})

// double-click the drag strip to maximize, like a native title bar
document.getElementById('chrome').addEventListener('dblclick', (e) => {
  if (e.target.closest('button, .tabs, .daynav')) return
  window.api.win.toggleMaximize()
})

/* ---------- zoom ---------- */

const ZOOM_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8]
const ZOOM_KEY = 'tt.zoom'

function applyZoom(factor) {
  window.api.zoom.set(factor)
  localStorage.setItem(ZOOM_KEY, String(factor))
}

function stepZoom(dir) {
  const current = window.api.zoom.get()
  // land on the nearest defined step, then move one notch
  let i = ZOOM_STEPS.reduce(
    (best, v, idx) => (Math.abs(v - current) < Math.abs(ZOOM_STEPS[best] - current) ? idx : best),
    0
  )
  i = Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))
  applyZoom(ZOOM_STEPS[i])
  toast(`zoom ${Math.round(ZOOM_STEPS[i] * 100)}%`)
}

function restoreZoom() {
  const saved = parseFloat(localStorage.getItem(ZOOM_KEY))
  if (Number.isFinite(saved) && saved > 0) window.api.zoom.set(saved)
}

document.addEventListener('keydown', (e) => {
  const typing = isTyping(document.activeElement)

  // zoom — works everywhere, including while typing
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(1); return }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); stepZoom(-1); return }
    if (e.key === '0') { e.preventDefault(); applyZoom(1); toast('zoom 100%'); return }
    if (e.key.toLowerCase() === 'e') { e.preventDefault(); ioDialog(); return }
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); return }
    if (e.key.toLowerCase() === 'j') { e.preventDefault(); Notes.toggle(); return }
  }

  // ctrl+enter toggles the task the caret is inside
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    const row = document.activeElement && document.activeElement.closest('.task')
    if (row) {
      e.preventDefault()
      const r = Store.toggleTask(row.dataset.task)
      if (r === 'pulled') {
        toast('reopened and pulled to today')
        App.date = Store.today()
      }
      render()
      return
    }
  }

  // ctrl+n adds a task to the epic the caret is inside (or the first one)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    if (App.view !== 'day' || App.date < Store.today()) return
    e.preventDefault()
    const row = document.activeElement && document.activeElement.closest('.task')
    let epicId = null
    if (row) {
      const task = Store.taskById(row.dataset.task)
      epicId = task && task.epicId
    }
    if (!epicId) {
      const first = Store.epicsSorted()[0]
      epicId = first && first.id
    }
    if (!epicId) return
    const task = Store.addTask(epicId, App.date, '')
    render()
    const el = $view.querySelector(`[data-fk="title:${CSS.escape(task.id)}"]`)
    if (el) el.focus()
    return
  }

  if (e.key === 'Escape' && typing) {
    document.activeElement.blur()
    return
  }

  if (typing || e.ctrlKey || e.metaKey || e.altKey) return

  if (e.key === '/') { e.preventDefault(); openSearch() }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goDate(Store.addDays(App.date, -1)) }
  else if (e.key === 'ArrowRight') { e.preventDefault(); goDate(Store.addDays(App.date, 1)) }
  else if (e.key.toLowerCase() === 't') { goDate(Store.today()) }
  else if (e.key === '1') setView('day')
  else if (e.key === '2') setView('cal')
  else if (e.key === '3') setView('tpl')
})

/* ============================================================
   DAY ROLLOVER WHILE THE APP STAYS OPEN
   ============================================================ */

let knownToday = null

// Midnight can pass with the app open; roll the list over without a restart.
function checkRollover() {
  const t = Store.today()
  if (t === knownToday) return

  const wasOnToday = App.date === knownToday
  knownToday = t

  const result = Store.generateIfNeeded()
  if (wasOnToday) {
    App.date = t
    App.calMonth = t.slice(0, 7)
  }
  render()

  if (result && (result.created || result.migrated)) {
    toast(`new day — ${result.created} from the template, ${result.migrated} carried over`)
  }
}

/* ============================================================
   DEV HELPERS (dev build only)
   ============================================================ */

function installDevHelpers() {
  // Simulate the calendar advancing without touching the system clock.
  window.__debugSetToday = (dateStr) => {
    Store.setDevToday(dateStr)
    const result = Store.generateIfNeeded()
    knownToday = Store.today()
    App.date = Store.today()
    App.calMonth = App.date.slice(0, 7)
    render()
    return result || 'no generation (already up to date)'
  }
  window.__debugState = () => JSON.parse(JSON.stringify(Store.state))
  window.__debugReset = async () => {
    Store.setDevToday(null)
    await Store.resetToSeed()
    knownToday = Store.today()
    App.date = Store.today()
    App.calMonth = App.date.slice(0, 7)
    render()
    return 'reset ok'
  }
  console.log('[dev] __debugSetToday("2026-07-25") · __debugState() · __debugReset()')
}

/* ============================================================
   BOOT
   ============================================================ */

// The modal overlay covers the whole window, title bar included. If a bug ever
// left one up, every control would look dead. Never let that be the end state.
function installSafetyValve() {
  const clearOverlay = () => {
    $modalRoot.hidden = true
    $modalRoot.textContent = ''
  }

  window.addEventListener('error', (e) => {
    clearOverlay()
    toast('something broke: ' + (e.message || 'unknown error'))
  })
  window.addEventListener('unhandledrejection', (e) => {
    clearOverlay()
    toast('something broke: ' + ((e.reason && e.reason.message) || 'unknown error'))
  })

  // last resort, always available: Escape closes whatever is covering the app
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$modalRoot.hidden) clearOverlay()
  })
}

async function boot() {
  installSafetyValve()
  restoreZoom()
  const res = await Store.init()
  App.date = Store.today()
  App.calMonth = App.date.slice(0, 7)
  // drop future days that were opened for planning but never written to
  Store.planDay(App.date)
  knownToday = Store.today()
  App.isDev = await window.api.isDev()
  if (App.isDev) installDevHelpers()

  window.api.onFlush(async () => {
    await Notes.flush()
    await Store.flush()
  })
  window.addEventListener('beforeunload', () => { Notes.flush(); Store.flush() })

  await Notes.boot()
  render()

  if (res.recovered) toast('main file was corrupt — restored from the backup')
  else if (res.generation && res.generation.migrated) {
    toast(`${res.generation.migrated} task(s) carried over to today`)
  }

  setInterval(checkRollover, 30000)
}

boot()
