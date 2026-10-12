// Tests only: a small in-memory stand-in for the Prisma calls the AI media code makes.
type Row = Record<string, unknown>
type Where = Record<string, unknown>
type OrderBy = Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[]

const OPS = ["in", "notIn", "not", "lt", "lte", "gt", "gte", "startsWith", "contains", "equals"]

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v))

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  return JSON.stringify(a) === JSON.stringify(b)
}

function test(value: unknown, cond: unknown): boolean {
  if (cond === undefined) return true
  if (cond === null) return value === null || value === undefined
  if (cond instanceof Date || typeof cond !== "object" || Array.isArray(cond)) return same(value, cond)
  const c = cond as Record<string, unknown>
  if (!Object.keys(c).some((k) => OPS.includes(k))) return same(value, cond)
  const n = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number))
  if ("equals" in c && !same(value, c.equals)) return false
  if ("in" in c && !(c.in as unknown[]).some((x) => same(value, x))) return false
  if ("notIn" in c && (c.notIn as unknown[]).some((x) => same(value, x))) return false
  if ("not" in c && (c.not === null ? value === null || value === undefined : test(value, c.not))) return false
  if ("lt" in c && !(value != null && n(value) < n(c.lt))) return false
  if ("lte" in c && !(value != null && n(value) <= n(c.lte))) return false
  if ("gt" in c && !(value != null && n(value) > n(c.gt))) return false
  if ("gte" in c && !(value != null && n(value) >= n(c.gte))) return false
  if ("startsWith" in c && !(typeof value === "string" && value.startsWith(c.startsWith as string))) return false
  if ("contains" in c && !(typeof value === "string" && value.includes(c.contains as string))) return false
  return true
}

export function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w))
    if (key === "AND") return (Array.isArray(cond) ? cond : [cond]).every((w) => matches(row, w as Where))
    if (key === "NOT") return !matches(row, cond as Where)
    return test(row[key], cond)
  })
}

function apply(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      const op = value as Record<string, number>
      if ("increment" in op) {
        row[key] = ((row[key] as number) ?? 0) + (op.increment ?? 0)
        continue
      }
      if ("decrement" in op) {
        row[key] = ((row[key] as number) ?? 0) - (op.decrement ?? 0)
        continue
      }
      if ("set" in op) {
        row[key] = clone(op.set)
        continue
      }
    }
    row[key] = clone(value)
  }
}

function sortRows(rows: Row[], orderBy: OrderBy | undefined): Row[] {
  if (!orderBy) return rows
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o))
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      const x = a[k] instanceof Date ? (a[k] as Date).getTime() : (a[k] as number | string)
      const y = b[k] instanceof Date ? (b[k] as Date).getTime() : (b[k] as number | string)
      if (x === y) continue
      return (x < y ? -1 : 1) * (dir === "desc" ? -1 : 1)
    }
    return 0
  })
}

export class NotFoundError extends Error {
  code = "P2025"
}

export function model(name: string, defaults: () => Row = () => ({}), unique: string[] = []) {
  const rows: Row[] = []
  let seq = 0
  const first = (where?: Where, orderBy?: OrderBy) => sortRows(rows.filter((r) => matches(r, where)), orderBy)[0]
  const api = {
    rows,
    findUnique: async ({ where }: { where: Where }) => clone(first(where) ?? null),
    findUniqueOrThrow: async ({ where }: { where: Where }) => {
      const row = first(where)
      if (!row) throw new NotFoundError(`${name} not found`)
      return clone(row)
    },
    findFirst: async (args: { where?: Where; orderBy?: OrderBy } = {}) => clone(first(args.where, args.orderBy) ?? null),
    findFirstOrThrow: async (args: { where?: Where; orderBy?: OrderBy } = {}) => {
      const row = first(args.where, args.orderBy)
      if (!row) throw new NotFoundError(`${name} not found`)
      return clone(row)
    },
    findMany: async (args: { where?: Where; orderBy?: OrderBy; take?: number; skip?: number } = {}) =>
      clone(sortRows(rows.filter((r) => matches(r, args.where)), args.orderBy).slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? Infinity))),
    count: async (args: { where?: Where } = {}) => rows.filter((r) => matches(r, args.where)).length,
    aggregate: async (args: { where?: Where; _sum?: Record<string, boolean> }) => {
      const hit = rows.filter((r) => matches(r, args.where))
      const _sum: Record<string, number | null> = {}
      for (const key of Object.keys(args._sum ?? {})) {
        const values = hit.map((r) => r[key]).filter((v): v is number => typeof v === "number")
        _sum[key] = values.length ? values.reduce((a, b) => a + b, 0) : null
      }
      return { _sum }
    },
    create: async ({ data }: { data: Row }) => {
      for (const key of unique) {
        if (data[key] !== undefined && rows.some((r) => same(r[key], data[key]))) {
          throw Object.assign(new Error(`Unique constraint failed on ${name}.${key}`), { code: "P2002" })
        }
      }
      const now = new Date()
      const row: Row = { id: `${name}_${++seq}`, createdAt: now, updatedAt: now, ...defaults() }
      apply(row, data)
      rows.push(row)
      return clone(row)
    },
    update: async ({ where, data }: { where: Where; data: Row }) => {
      const row = first(where)
      if (!row) throw new NotFoundError(`${name} to update not found`)
      apply(row, data)
      row.updatedAt = new Date()
      return clone(row)
    },
    updateMany: async ({ where, data }: { where?: Where; data: Row }) => {
      const hit = rows.filter((r) => matches(r, where))
      for (const row of hit) {
        apply(row, data)
        row.updatedAt = new Date()
      }
      return { count: hit.length }
    },
    upsert: async ({ where, create, update }: { where: Where; create: Row; update: Row }) =>
      first(where) ? api.update({ where, data: update }) : api.create({ data: create }),
    delete: async ({ where }: { where: Where }) => {
      const i = rows.findIndex((r) => matches(r, where))
      if (i < 0) throw new NotFoundError(`${name} to delete not found`)
      return clone(rows.splice(i, 1)[0])
    },
    deleteMany: async ({ where }: { where?: Where } = {}) => {
      const keep = rows.filter((r) => !matches(r, where))
      const count = rows.length - keep.length
      rows.splice(0, rows.length, ...keep)
      return { count }
    },
  }
  return api
}

export function createMemoryDb() {
  const db = {
    mediaJob: model("job", () => ({
      status: "QUEUED",
      stage: null,
      checkpoint: null,
      checkpointExpiresAt: null,
      mediaBrief: null,
      plan: null,
      concepts: null,
      state: {},
      bindings: null,
      creditsReserved: 0,
      creditsRefunded: 0,
      costUsd: 0,
      versionId: null,
      compiledAt: null,
      compiledBindings: null,
      resultVersionId: null,
      failureReason: null,
      startedAt: null,
      finishedAt: null,
    })),
    mediaGeneration: model("gen", () => ({ attempt: 1, costUsd: null, latencyMs: null, error: null, outputAssetId: null, providerTaskId: null }), ["requestKey"]),
    mediaAsset: model("asset", () => ({ deletedAt: null, status: "READY", variants: [], generation: null, altText: null })),
    creditBalance: model("bal"),
    creditTransaction: model("tx", () => ({ refType: null, refId: null })),
    project: model("proj", () => ({ deletedAt: null })),
    projectVersion: model("ver", () => ({ blueprint: null })),
    projectBrief: model("brief"),
    researchReport: model("report"),
    researchReportCitation: model("cite"),
    styleTag: model("tag"),
    $transaction: async (arg: unknown): Promise<unknown> =>
      typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(db) : Promise.all(arg as Promise<unknown>[]),
  }
  return db
}

export type MemoryDb = ReturnType<typeof createMemoryDb>
