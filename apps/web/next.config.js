import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {
        root: path.resolve(__dirname, '../../'),
    },
    transpilePackages: ['@repo/schemas', '@repo/events'],
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
            { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
        ],
    },
    headers: async () => [
        {
            source: '/(.*)',
            headers: [
                {
                    key: 'Cross-Origin-Opener-Policy',
                    value: 'same-origin',
                },
                // credentialless keeps the page cross-origin isolated for
                // WebContainers while still letting previews load hotlinked
                // images/videos from CDNs that send no CORP header. Must match
                // the coep option passed to WebContainer.boot().
                {
                    key: 'Cross-Origin-Embedder-Policy',
                    value: 'credentialless',
                },
            ],
        },
    ],
}

export default nextConfig
