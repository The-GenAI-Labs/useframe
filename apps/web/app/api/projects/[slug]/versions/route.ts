import { NextResponse } from "next/server"
import { apiServer, ApiServerError } from "@/lib/apiServer"

type Params = { params: Promise<{ slug: string }> }

export async function GET(_req: Request, { params }: Params) {
    const { slug } = await params
    try {
        const versions = await apiServer.listVersions(slug)
        return NextResponse.json({ success: true, data: versions })
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

export async function POST(_req: Request, { params }: Params) {
    const { slug } = await params
    try {
        const result = await apiServer.createVersion(slug)
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
