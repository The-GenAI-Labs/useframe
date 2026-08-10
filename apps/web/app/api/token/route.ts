import { NextResponse } from "next/server"
import { getBridgeToken } from "@/lib/bridgeToken"

export async function GET() {
    const token = await getBridgeToken()

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json({ accessToken: token })
}
