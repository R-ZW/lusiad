import { NextResponse, type NextRequest } from "next/server"
import { loadRuntimeConfig } from "./lib/config/runtime-config"
import { loadOperationalConfig } from "./lib/config/operational-config"
import { authorizedFrontendOrigin, frontendForwardHeaders } from "./lib/config/frontend-access"

export function proxy(request: NextRequest) {
  try {
    const runtime = loadRuntimeConfig()
    const access = runtime.test ? { frontendUrl: runtime.test.frontendUrl, allowCloudflareTunnel: false } : loadOperationalConfig()
    const authorized = authorizedFrontendOrigin(access.frontendUrl, request.headers.get("host"), request.headers.get("origin"), access.allowCloudflareTunnel)
    if (!authorized) {
      return NextResponse.json({ code: "client_not_authorized", error: "Open Lusiad at its configured frontend URL or enable Cloudflare Quick Tunnel access on the host" }, { status: 403 })
    }
    return NextResponse.next({ request: { headers: frontendForwardHeaders(request.headers, authorized) } })
  } catch { return NextResponse.json({ code: "configuration_unavailable" }, { status: 503 }) }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] }
