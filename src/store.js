/* taskr — state, daily generation, persistence.
   Plain global (no modules): file:// blocks ES module imports in Electron. */

const Store = (() => {
  const SCHEMA_VERSION = 1
  const SAVE_DEBOUNCE_MS = 600

  let state = null
  let devToday = null // dev-only override, see __debugSetToday
  let saveTimer = null
  let listeners = []

  /* ---------- dates (all local, never UTC) ---------- */

  function fmt(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function today() {
    return devToday || fmt(new Date())
  }

  function parse(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  function addDays(dateStr, n) {
    const d = parse(dateStr)
    d.setDate(d.getDate() + n)
    return fmt(d)
  }

  function daysBetween(a, b) {
    return Math.round((parse(b) - parse(a)) / 86400000)
  }

  /* ---------- ids ---------- */

  let idCounter = 0
  function uid(prefix) {
    idCounter += 1
    return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`
  }

  /* ---------- seed ---------- */

  function seedState() {
    const t = today()
    const e1 = uid('epic')
    const e2 = uid('epic')
    return {
      schemaVersion: SCHEMA_VERSION,
      lastGeneratedDate: null,
      dayTargetHours: 8,
      epicHours: {},
      epics: [
        { id: e1, name: 'CLIENT A', order: 0, folder: null },
        { id: e2, name: 'INTERNAL', order: 1, folder: null }
      ],
      templateItems: [
        { id: uid('tpl'), epicId: e1, title: 'daily / stand-up', defaultHours: 0.5, order: 0 },
        { id: uid('tpl'), epicId: e1, title: 'development', defaultHours: 4, order: 1 },
        { id: uid('tpl'), epicId: e2, title: 'email and messages', defaultHours: 0.5, order: 0 }
      ],
      tasks: [],
      createdAt: t
    }
  }

  /* ---------- normalization (tolerate older / hand-edited files) ---------- */

  function normalize(raw) {
    const s = raw && typeof raw === 'object' ? raw : {}
    const t = today()
    return {
      schemaVersion: SCHEMA_VERSION,
      lastGeneratedDate: typeof s.lastGeneratedDate === 'string' ? s.lastGeneratedDate : null,
      dayTargetHours: Number.isFinite(s.dayTargetHours) && s.dayTargetHours > 0 ? s.dayTargetHours : 8,
      // "epicId|YYYY-MM-DD" -> hours. Present means the epic total is typed by
      // hand for that day and wins over the sum of its tasks.
      epicHours: (() => {
        const out = {}
        const src = s.epicHours && typeof s.epicHours === 'object' ? s.epicHours : {}
        for (const k of Object.keys(src)) {
          const v = src[k]
          if (Number.isFinite(v) && v >= 0) out[k] = v
        }
        return out
      })(),
      epics: Array.isArray(s.epics)
        ? s.epics.map((e, i) => ({
            id: e.id || uid('epic'),
            name: typeof e.name === 'string' ? e.name : 'UNNAMED',
            order: Number.isFinite(e.order) ? e.order : i,
            folder: typeof e.folder === 'string' && e.folder ? e.folder : null
          }))
        : [],
      templateItems: Array.isArray(s.templateItems)
        ? s.templateItems.map((it, i) => ({
            id: it.id || uid('tpl'),
            epicId: it.epicId,
            title: typeof it.title === 'string' ? it.title : '',
            defaultHours: Number.isFinite(it.defaultHours) ? it.defaultHours : 0,
            order: Number.isFinite(it.order) ? it.order : i
          }))
        : [],
      tasks: Array.isArray(s.tasks)
        ? s.tasks.map((k, i) => ({
            id: k.id || uid('task'),
            epicId: k.epicId,
            title: typeof k.title === 'string' ? k.title : '',
            hours: Number.isFinite(k.hours) ? k.hours : 0,
            done: !!k.done,
            doneDate: typeof k.doneDate === 'string' ? k.doneDate : null,
            response: typeof k.response === 'string' ? k.response : '',
            comments: typeof k.comments === 'string' ? k.comments : '',
            date: typeof k.date === 'string' ? k.date : t,
            dueDate: typeof k.dueDate === 'string' && k.dueDate ? k.dueDate : null,
            createdDate: typeof k.createdDate === 'string' ? k.createdDate : (k.date || t),
            fromTemplateId: k.fromTemplateId || null,
            // a carried task leaves its original in place; these two link the pair
            carriedFrom: typeof k.carriedFrom === 'string' ? k.carriedFrom : null,
            carriedTo: typeof k.carriedTo === 'string' ? k.carriedTo : null,
            order: Number.isFinite(k.order) ? k.order : i,
            links: Array.isArray(k.links)
              ? k.links
                  .filter((l) => l && typeof l.path === 'string' && l.path)
                  .map((l) => ({ path: l.path, name: typeof l.name === 'string' ? l.name : l.path }))
              : []
          }))
        : [],
      createdAt: typeof s.createdAt === 'string' ? s.createdAt : t
    }
  }

  /* ---------- daily generation ---------- */

  function taskFromTemplate(item, date) {
    return {
      id: uid('task'),
      epicId: item.epicId,
      title: item.title,
      hours: 0,
      done: false,
      doneDate: null,
      response: '',
      comments: '',
      date,
      dueDate: null,
      createdDate: date,
      fromTemplateId: item.id,
      carriedFrom: null,
      carriedTo: null,
      links: [],
      order: item.order
    }
  }

  // A day that has passed is a record: it keeps every task exactly as it stood.
  // Unfinished work reaches the new day as a fresh copy instead of being moved,
  // so nothing ever disappears from the day it belonged to.
  function carryCopy(task, date) {
    return {
      ...task,
      id: uid('task'),
      date,
      hours: 0,
      done: false,
      doneDate: null,
      carriedFrom: task.id,
      carriedTo: null,
      links: task.links.map((l) => ({ ...l }))
    }
  }

  function templateMap() {
    const m = new Map()
    for (const it of state.templateItems) m.set(it.id, it)
    return m
  }

  // Unfinished work reaches the new day. A finished task never travels: it stays
  // on the day it was completed, which is where it actually happened.
  function shouldCarry(task) {
    return !task.done && !task.carriedTo
  }

  // An untouched template task: generated but never engaged with. Safe to drop or replace.
  function isPlaceholder(task, tplMap) {
    if (task.done || task.hours || !task.fromTemplateId || task.carriedFrom) return false
    if (task.response.trim() || task.comments.trim()) return false
    const tpl = tplMap.get(task.fromTemplateId)
    return !!tpl && tpl.title === task.title
  }

  // Fills in whatever the template says should exist on `date`, skipping items
  // already present there. Used for today and for planning days ahead.
  function materializeDay(date) {
    const validEpics = new Set(state.epics.map((e) => e.id))
    // A task holds the day's slot if it is still open, or if it was completed on
    // this very day. One completed earlier and carried in by its deadline is only
    // a reminder, so the template still gets to lay down a fresh copy.
    const present = new Set(
      state.tasks
        .filter((k) => k.date === date && k.fromTemplateId && (!k.done || k.doneDate === date))
        .map((k) => k.fromTemplateId)
    )
    const items = state.templateItems
      .filter((it) => validEpics.has(it.epicId) && !present.has(it.id))
      .sort((a, b) => a.order - b.order)

    for (const item of items) state.tasks.push(taskFromTemplate(item, date))
    return items.length
  }

  // Rolls every unfinished task forward and materializes today's list from the
  // template. Idempotent per day, and correct across multi-day gaps.
  function runDailyGeneration() {
    const t = today()
    if (state.lastGeneratedDate && state.lastGeneratedDate >= t) return false

    const tplMap = templateMap()

    // Today may already hold placeholders from planning ahead. A real task rolling
    // in from yesterday takes their slot rather than sitting beside a duplicate.
    const placeholders = new Map()
    for (const k of state.tasks) {
      if (k.date === t && k.fromTemplateId && isPlaceholder(k, tplMap)) {
        placeholders.set(k.fromTemplateId, k)
      }
    }

    const drop = new Set()
    const copies = []
    // snapshot first: the copies land in state.tasks and must not be scanned again
    const sources = state.tasks.filter((k) => k.date < t && shouldCarry(k))
    for (const task of sources) {
      const slot = task.fromTemplateId && placeholders.get(task.fromTemplateId)
      if (slot) {
        drop.add(slot.id)
        placeholders.delete(task.fromTemplateId)
      }
      const copy = carryCopy(task, t)
      task.carriedTo = copy.id
      copies.push(copy)
    }
    state.tasks.push(...copies)
    const migrated = copies.length
    if (drop.size) state.tasks = state.tasks.filter((k) => !drop.has(k.id))

    const created = materializeDay(t)
    state.lastGeneratedDate = t
    return { migrated, created }
  }

  // Days planned ahead but never touched are discarded so they don't linger
  // in the calendar as phantom workload.
  function pruneFutureDays(exceptDate) {
    const t = today()
    const tplMap = templateMap()
    const byDate = new Map()

    for (const k of state.tasks) {
      if (k.date <= t || k.date === exceptDate) continue
      if (!byDate.has(k.date)) byDate.set(k.date, [])
      byDate.get(k.date).push(k)
    }

    const drop = new Set()
    for (const [, tasks] of byDate) {
      if (tasks.every((k) => isPlaceholder(k, tplMap))) {
        for (const k of tasks) drop.add(k.id)
      }
    }
    if (drop.size) state.tasks = state.tasks.filter((k) => !drop.has(k.id))
    return drop.size
  }

  /* ---------- persistence ---------- */

  function emit() {
    for (const fn of listeners) fn(state)
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS)
  }

  async function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!state) return
    await window.api.saveData(state)
  }

  // Every mutation goes through here: mutate, persist, notify.
  function commit(mutator, opts = {}) {
    const result = mutator(state)
    scheduleSave()
    if (!opts.silent) emit()
    return result
  }

  async function init() {
    const res = await window.api.loadData()
    state = res && res.data ? normalize(res.data) : seedState()
    const gen = runDailyGeneration()
    if (gen) await flush()
    else scheduleSave()
    return { recovered: !!(res && res.recovered), generation: gen }
  }

  function onChange(fn) {
    listeners.push(fn)
  }

  /* ---------- reads ---------- */

  function epicsSorted() {
    return [...state.epics].sort((a, b) => a.order - b.order)
  }

  function templateItemsFor(epicId) {
    return state.templateItems.filter((it) => it.epicId === epicId).sort((a, b) => a.order - b.order)
  }

  function tasksOn(date) {
    return state.tasks.filter((k) => k.date === date)
  }

  function tasksFor(epicId, date) {
    return tasksOn(date)
      .filter((k) => k.epicId === epicId)
      .sort((a, b) => a.order - b.order || a.createdDate.localeCompare(b.createdDate))
  }

  /* ---------- epic hours ---------- */

  const ehKey = (epicId, date) => `${epicId}|${date}`

  // Time booked on the epic itself, for work that belongs to no single task.
  // It stands on its own; task hours are added on top of it.
  function epicExtra(epicId, date) {
    const v = state.epicHours[ehKey(epicId, date)]
    return Number.isFinite(v) ? v : 0
  }

  function setEpicExtra(epicId, date, hours) {
    return commit((s) => {
      const key = ehKey(epicId, date)
      const clean = Math.min(24, Math.max(0, Math.round((hours || 0) * 4) / 4))
      if (!clean) delete s.epicHours[key]
      else s.epicHours[key] = clean
      return clean
    })
  }

  function epicTaskSum(epicId, date) {
    return tasksFor(epicId, date).reduce((s, k) => s + (k.hours || 0), 0)
  }

  // What this epic contributes to the day: its own loose time plus its tasks.
  function epicTotal(epicId, date) {
    return epicExtra(epicId, date) + epicTaskSum(epicId, date)
  }

  function hoursOn(date) {
    return state.epics.reduce((sum, e) => sum + epicTotal(e.id, date), 0)
  }

  function dayStats(date) {
    const list = tasksOn(date)
    return {
      hours: hoursOn(date),
      total: list.length,
      done: list.filter((k) => k.done).length
    }
  }

  // every distinct file linked anywhere, newest task first
  function allLinks() {
    const seen = new Map()
    for (const task of [...state.tasks].sort((a, b) => b.date.localeCompare(a.date))) {
      for (const l of task.links) {
        if (seen.has(l.path)) continue
        seen.set(l.path, { ...l, epicId: task.epicId, taskTitle: task.title, date: task.date })
      }
    }
    return [...seen.values()]
  }

  function taskById(id) {
    return state.tasks.find((k) => k.id === id) || null
  }

  function epicById(id) {
    return state.epics.find((e) => e.id === id) || null
  }

  /* ---------- task mutations ---------- */

  function updateTask(id, patch) {
    return commit((s) => {
      const task = s.tasks.find((k) => k.id === id)
      if (!task) return null
      Object.assign(task, patch)
      return task
    })
  }

  // Returns 'pulled' when unchecking a past task drags it back to the current day.
  function toggleTask(id) {
    return commit((s) => {
      const task = s.tasks.find((k) => k.id === id)
      if (!task) return null
      const t = today()
      task.done = !task.done
      if (task.done) {
        task.doneDate = task.date
        return 'done'
      }
      task.doneDate = null
      // Reopening something from a past day leaves that day's record alone and
      // brings a fresh copy to today, the same way the daily carry works.
      if (task.date < t && !task.carriedTo) {
        const copy = carryCopy(task, t)
        task.carriedTo = copy.id
        s.tasks.push(copy)
        return 'pulled'
      }
      return 'open'
    })
  }

  function addTask(epicId, date, title = '') {
    return commit((s) => {
      const siblings = s.tasks.filter((k) => k.epicId === epicId && k.date === date)
      const order = siblings.reduce((m, k) => Math.max(m, k.order), -1) + 1
      const task = {
        id: uid('task'),
        epicId,
        title,
        hours: 0,
        done: false,
        doneDate: null,
        response: '',
        comments: '',
        date,
        dueDate: null,
        createdDate: date,
        fromTemplateId: null,
        carriedFrom: null,
        carriedTo: null,
        links: [],
        order
      }
      s.tasks.push(task)
      return task
    })
  }

  function removeTask(id) {
    return commit((s) => {
      const i = s.tasks.findIndex((k) => k.id === id)
      if (i >= 0) s.tasks.splice(i, 1)
      // the day it came from is open again, so it can carry forward once more
      const source = s.tasks.find((k) => k.carriedTo === id)
      if (source) source.carriedTo = null
    })
  }

  function moveTask(id, dir) {
    return commit((s) => {
      const task = s.tasks.find((k) => k.id === id)
      if (!task) return
      const siblings = s.tasks
        .filter((k) => k.epicId === task.epicId && k.date === task.date)
        .sort((a, b) => a.order - b.order)
      const i = siblings.indexOf(task)
      const j = i + dir
      if (j < 0 || j >= siblings.length) return
      siblings.forEach((k, idx) => (k.order = idx))
      const tmp = siblings[i].order
      siblings[i].order = siblings[j].order
      siblings[j].order = tmp
    })
  }

  function addTaskLinks(id, links) {
    return commit((s) => {
      const task = s.tasks.find((k) => k.id === id)
      if (!task) return 0
      const have = new Set(task.links.map((l) => l.path))
      let added = 0
      for (const l of links) {
        if (have.has(l.path)) continue
        task.links.push(l)
        have.add(l.path)
        added += 1
      }
      return added
    })
  }

  function removeTaskLink(id, path) {
    return commit((s) => {
      const task = s.tasks.find((k) => k.id === id)
      if (task) task.links = task.links.filter((l) => l.path !== path)
    })
  }

  /* ---------- settings ---------- */

  function setDayTarget(hours) {
    return commit((s) => {
      s.dayTargetHours = Math.min(24, Math.max(0.5, Math.round(hours * 2) / 2))
      return s.dayTargetHours
    })
  }

  /* ---------- epic mutations ---------- */

  function addEpic(name = 'NEW EPIC') {
    return commit((s) => {
      const order = s.epics.reduce((m, e) => Math.max(m, e.order), -1) + 1
      const epic = { id: uid('epic'), name, order, folder: null }
      s.epics.push(epic)
      return epic
    })
  }

  function updateEpic(id, patch) {
    return commit((s) => {
      const epic = s.epics.find((e) => e.id === id)
      if (epic) Object.assign(epic, patch)
    })
  }

  // Removes the epic, its template items and its tasks — the caller confirms first.
  function removeEpic(id) {
    return commit((s) => {
      s.epics = s.epics.filter((e) => e.id !== id)
      s.templateItems = s.templateItems.filter((it) => it.epicId !== id)
      s.tasks = s.tasks.filter((k) => k.epicId !== id)
    })
  }

  function moveEpic(id, dir) {
    return commit((s) => {
      const sorted = [...s.epics].sort((a, b) => a.order - b.order)
      const i = sorted.findIndex((e) => e.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= sorted.length) return
      sorted.forEach((e, idx) => (e.order = idx))
      const tmp = sorted[i].order
      sorted[i].order = sorted[j].order
      sorted[j].order = tmp
    })
  }

  /* ---------- template mutations ---------- */

  function addTemplateItem(epicId, title = '', defaultHours = 0) {
    return commit((s) => {
      const siblings = s.templateItems.filter((it) => it.epicId === epicId)
      const order = siblings.reduce((m, it) => Math.max(m, it.order), -1) + 1
      const item = { id: uid('tpl'), epicId, title, defaultHours, order }
      s.templateItems.push(item)
      return item
    })
  }

  function updateTemplateItem(id, patch) {
    return commit((s) => {
      const item = s.templateItems.find((it) => it.id === id)
      if (item) Object.assign(item, patch)
    })
  }

  function removeTemplateItem(id) {
    return commit((s) => {
      s.templateItems = s.templateItems.filter((it) => it.id !== id)
    })
  }

  function moveTemplateItem(id, dir) {
    return commit((s) => {
      const item = s.templateItems.find((it) => it.id === id)
      if (!item) return
      const siblings = s.templateItems
        .filter((it) => it.epicId === item.epicId)
        .sort((a, b) => a.order - b.order)
      const i = siblings.indexOf(item)
      const j = i + dir
      if (j < 0 || j >= siblings.length) return
      siblings.forEach((it, idx) => (it.order = idx))
      const tmp = siblings[i].order
      siblings[i].order = siblings[j].order
      siblings[j].order = tmp
    })
  }

  /* ---------- dev helpers ---------- */

  /* ---------- import ---------- */

  // 'replace' swaps the whole state; 'merge' only adds records whose id is absent,
  // so re-importing the same file twice is a no-op.
  function importData(raw, mode) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks) || !Array.isArray(raw.epics)) {
      throw new Error('that file does not look like a taskr backup')
    }
    const incoming = normalize(raw)

    if (mode === 'replace') {
      const stats = {
        epics: incoming.epics.length,
        templateItems: incoming.templateItems.length,
        tasks: incoming.tasks.length
      }
      state = incoming
      runDailyGeneration()
      scheduleSave()
      return stats
    }

    const have = (arr) => new Set(arr.map((x) => x.id))
    const haveEpics = have(state.epics)
    const haveItems = have(state.templateItems)
    const haveTasks = have(state.tasks)

    const stats = { epics: 0, templateItems: 0, tasks: 0 }

    for (const e of incoming.epics) {
      if (haveEpics.has(e.id)) continue
      state.epics.push({ ...e, order: state.epics.length })
      haveEpics.add(e.id)
      stats.epics += 1
    }
    // template items and tasks are meaningless without their epic
    for (const it of incoming.templateItems) {
      if (haveItems.has(it.id) || !haveEpics.has(it.epicId)) continue
      state.templateItems.push(it)
      stats.templateItems += 1
    }
    for (const k of incoming.tasks) {
      if (haveTasks.has(k.id) || !haveEpics.has(k.epicId)) continue
      state.tasks.push(k)
      stats.tasks += 1
    }

    scheduleSave()
    return stats
  }

  async function resetToSeed() {
    state = seedState()
    runDailyGeneration()
    await flush()
  }

  /* ---------- search ---------- */

  // One query across everything the app knows: epics, tasks (title, response,
  // comments) and linked files. Newest first, since recent work is what is
  // usually being looked for.
  function search(query, limit = 10) {
    const q = String(query || '').trim().toLowerCase()
    const empty = { query: q, epics: [], tasks: [], files: [], total: 0 }
    if (q.length < 2) return empty

    const hit = (s) => typeof s === 'string' && s.toLowerCase().includes(q)

    const epics = state.epics
      .filter((e) => hit(e.name))
      .sort((a, b) => a.order - b.order)
      .slice(0, limit)

    const tasks = state.tasks
      .filter((k) => hit(k.title) || hit(k.response) || hit(k.comments))
      .sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order)
      .slice(0, limit)
      .map((k) => {
        const epic = epicById(k.epicId)
        // show the line that actually matched, not just the title
        const where = hit(k.title) ? null : hit(k.response) ? k.response : k.comments
        const line = where
          ? (where.split('\n').find((l) => hit(l)) || '').trim()
          : ''
        return { task: k, epicName: epic ? epic.name : '—', excerpt: line }
      })

    const files = []
    const seenPaths = new Set()
    for (const epic of epicsSorted()) {
      if (epic.folder && hit(epic.folder) && !seenPaths.has(epic.folder)) {
        seenPaths.add(epic.folder)
        files.push({ path: epic.folder, name: epic.name, sub: 'epic folder', isFolder: true })
      }
    }
    for (const l of allLinks()) {
      if (files.length >= limit) break
      if (seenPaths.has(l.path) || !(hit(l.name) || hit(l.path))) continue
      seenPaths.add(l.path)
      files.push({ path: l.path, name: l.name, sub: `${l.date} · ${l.taskTitle || 'untitled'}` })
    }

    return { query: q, epics, tasks, files, total: epics.length + tasks.length + files.length }
  }

  // Public wrapper: run generation and persist if anything changed.
  function generateIfNeeded() {
    const result = runDailyGeneration()
    if (result) scheduleSave()
    return result
  }

  return {
    init,
    flush,
    onChange,
    commit,
    generateIfNeeded,
    resetToSeed,
    importData,
    // whole-state snapshot, for export
    snapshot: () => JSON.parse(JSON.stringify(state)),
    // Prepare a future day for planning, then drop any other untouched future days.
    planDay(date) {
      return commit(() => {
        const created = date > today() ? materializeDay(date) : 0
        pruneFutureDays(date)
        return created
      }, { silent: true })
    },
    setDevToday(dateStr) {
      devToday = dateStr || null
    },
    // dates
    today,
    fmt,
    parse,
    addDays,
    daysBetween,
    // reads
    get state() {
      return state
    },
    epicsSorted,
    templateItemsFor,
    tasksOn,
    tasksFor,
    hoursOn,
    dayStats,
    epicExtra,
    setEpicExtra,
    epicTaskSum,
    epicTotal,
    allLinks,
    search,
    taskById,
    epicById,
    // writes
    updateTask,
    toggleTask,
    addTask,
    removeTask,
    moveTask,
    addTaskLinks,
    removeTaskLink,
    setDayTarget,
    addEpic,
    updateEpic,
    removeEpic,
    moveEpic,
    addTemplateItem,
    updateTemplateItem,
    removeTemplateItem,
    moveTemplateItem
  }
})()
