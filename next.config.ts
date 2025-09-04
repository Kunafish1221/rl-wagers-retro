// next.config.ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typedRoutes: false, // ✅ correct location in Next 15+
  eslint: {
    // 🚫 Do not fail production builds because of ESLint
    ignoreDuringBuilds: true,
  },
  // If TypeScript errors ever block builds, uncomment:
  // typescript: { ignoreBuildErrors: true },
}

export default nextConfig