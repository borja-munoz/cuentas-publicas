import * as duckdb from '@duckdb/duckdb-wasm'

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null

export function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) dbPromise = initDB()
  return dbPromise
}

async function initDB(): Promise<duckdb.AsyncDuckDB> {
  const bundles = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(bundles)
  const worker = await duckdb.createWorker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  const res = await fetch(import.meta.env.BASE_URL + 'db/cuentas-publicas.duckdb')
  await db.registerFileBuffer('cp.duckdb', new Uint8Array(await res.arrayBuffer()))

  const conn = await db.connect()
  await conn.query("ATTACH 'cp.duckdb' AS cp (READ_ONLY)")
  await conn.close()

  return db
}

export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const db = await getDB()
  const conn = await db.connect()
  const result = await conn.query(sql)
  await conn.close()
  return result.toArray().map((r) => r.toJSON()) as T[]
}
