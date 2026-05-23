import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig = {
    turbopack: {
        root: path.resolve(__dirname, '../../'), // absolute path to monorepo root
    },
}

export default nextConfig