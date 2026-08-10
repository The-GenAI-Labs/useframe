import { NextResponse } from "next/server"
import { apiServer, ApiServerError } from "@/lib/apiServer"

export async function GET() {
    try {
        const projects = await apiServer.listProjects()
        return NextResponse.json({ success: true, data: projects })
    } catch (err) {
        if (err instanceof ApiServerError) {
            return NextResponse.json(
                { success: false, message: err.message, errors: err.errors },
                { status: err.status }
            )
        }
        return NextResponse.json(
            { success: false, message: "Something went wrong" },
            { status: 500 }
        )
    }
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => null)
    if (!body) {
        return NextResponse.json(
            { success: false, message: "Invalid JSON body" },
            { status: 400 }
        )
    }

    try {
        const result = await apiServer.createProject(body)
        return NextResponse.json({ success: true, data: result }, { status: 201 })
    } catch (err) {
        if (err instanceof ApiServerError) {
            return NextResponse.json(
                { success: false, message: err.message, errors: err.errors },
                { status: err.status }
            )
        }
        return NextResponse.json(
            { success: false, message: "Something went wrong" },
            { status: 500 }
        )
    }
}
