import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {
        root: path.resolve(__dirname, '../../'),
    },
    headers: async () => [
        {
            source: '/(.*)',
            headers: [
                {
                    key: 'Cross-Origin-Opener-Policy',
                    value: 'same-origin',
                },
                {
                    key: 'Cross-Origin-Embedder-Policy',
                    value: 'require-corp',
                },
            ],
        },
    ],
}

export default nextConfig
