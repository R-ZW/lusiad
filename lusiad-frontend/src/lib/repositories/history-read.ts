import 'server-only'
import type { PoolConnection } from 'mysql2/promise'
import { getPool } from './database'

/** Page, membership and count must describe the same committed database state. */
export async function historyRead<T>(read: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection()
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY')
    const value = await read(connection)
    await connection.commit()
    return value
  } catch (error) {
    await connection.rollback().catch(() => {})
    throw error
  } finally { connection.release() }
}
