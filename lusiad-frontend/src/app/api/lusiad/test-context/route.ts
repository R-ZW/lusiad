import { loadRuntimeConfig, publicTestContext } from "@/lib/config/runtime-config"
import { getPool } from "@/lib/repositories/database"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Test-only, read-only. No reset, seed, shutdown or credentials are exposed here.
export async function GET() {
  try {
    const config = loadRuntimeConfig()
    if (!config.test) return new Response(null, { status: 404 })
    await getPool().query("SELECT 1") // guarded checkout also proves the backend identity
    return Response.json({ ...publicTestContext(config), service: "frontend", ready: true, pid: process.pid },
      { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ ready: false, code: "test_environment_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
