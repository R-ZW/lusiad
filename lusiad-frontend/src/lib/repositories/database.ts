import "server-only"

import mysql from "mysql2/promise"
import type { Pool } from "mysql2/promise"
import { loadRuntimeConfig } from "../config/runtime-config"
import { guardTestPool } from "../config/test-database"
import { loadOperationalConfig } from '../config/operational-config'
import { createHash } from 'node:crypto'

let pool: Pool | null = null
let identity: string | null = null

export function getPool(): Pool {
  if (pool) {
    return pool
  }

  const config = loadRuntimeConfig()
  const database = config.test ? { ...config.test.database, connectTimeoutMs: 5000, tls: false } : loadOperationalConfig().database
  if (!database.user.trim()) throw new Error('Configure LUSIAD_DB_USER or database.user in the Lusiad configuration file')
  const raw = mysql.createPool({
    host: database.host,
    port: database.port,
    database: database.name,
    user: database.user,
    password: database.password,
    ...(database.tls ? { ssl: { rejectUnauthorized: true, verifyIdentity: true } } : {}),
    waitForConnections: true,
    connectionLimit: 8,
    queueLimit: 0,
    dateStrings: true,
    connectTimeout: database.connectTimeoutMs,
  })
  pool = config.test ? guardTestPool(raw) : raw
  identity = createHash('sha256').update(`${database.host.toLowerCase()}\n${database.port}\n${database.name}`).digest('hex')

  return pool
}

/** Identifies the pool actually used; no account or password is published. */
export function databaseIdentity(): string {
  getPool()
  return identity!
}
