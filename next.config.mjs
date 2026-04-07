/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/llms.txt',
        destination: '/api/llms',
      },
    ]
  },
  async redirects() {
    return [
      // ============================================
      // OLD WORDPRESS ARTICLE URLS -> NEW PATHS
      // 301 permanent redirects to preserve SEO equity
      // ============================================

      // --- Exchange Reviews ---
      {
        source: '/weex-exchange-review-2025-unleashing-400x-leverage-no-kyc-trading-with-exclusive-bonuses/:path*',
        destination: '/reviews/weex-review',
        permanent: true,
      },
      {
        source: '/coinex-exchange-review-2025-is-it-safe-worth-using/:path*',
        destination: '/reviews/coinex-review',
        permanent: true,
      },
      {
        source: '/bydfi-cryptocurrency-exchange-review-updated/:path*',
        destination: '/reviews/bydfi-review',
        permanent: true,
      },
      {
        source: '/toobit-exchange-review-vip-pass-low-fees-big-bonuses/:path*',
        destination: '/reviews/toobit-review',
        permanent: true,
      },
      {
        source: '/xt-exchange-review-2025-is-it-worth-signing-up/:path*',
        destination: '/reviews/xt-review',
        permanent: true,
      },
      {
        source: '/what-is-crypto-prop-trading-how-it-works-why-its-gaining-traction-in-2025/:path*',
        destination: '/reviews/crypto-prop-trading',
        permanent: true,
      },
      {
        source: '/are-exchange-tokens-worth-holding-in-2025-pros-cons-explained/:path*',
        destination: '/reviews/exchange-tokens-worth-holding',
        permanent: true,
      },
      {
        source: '/crypto-exchanges-to-avoid-in-2025/:path*',
        destination: '/reviews/crypto-exchanges-to-avoid',
        permanent: true,
      },
      {
        source: '/bingx-review-2025-pros-cons-bonuses-for-crypto-traders/:path*',
        destination: '/reviews/bingx-review',
        permanent: true,
      },

      // --- No-KYC Exchanges ---
      {
        source: '/bitunix-exchange-review-2026-a-rising-no-kyc-futures-platform/:path*',
        destination: '/no-kyc/bitunix-review',
        permanent: true,
      },
      {
        source: '/weex-vs-blofin-2025-fees-leverage-kyc-limits-cards-copy-trading-compared/:path*',
        destination: '/no-kyc/weex-vs-blofin',
        permanent: true,
      },
      {
        source: '/is-it-safe-to-use-no-kyc-exchanges-in-2025/:path*',
        destination: '/no-kyc/is-it-safe-no-kyc-exchanges',
        permanent: true,
      },
      {
        source: '/kcex-exchange-review-no-kyc-high-leverage-but-whats-the-catch/:path*',
        destination: '/no-kyc/kcex-review',
        permanent: true,
      },
      {
        source: '/blofin-com-exchange-review-2025-the-next-gen-platform-for-crypto-derivatives/:path*',
        destination: '/no-kyc/blofin-review',
        permanent: true,
      },

      // --- Comparisons ---
      {
        source: '/weex-vs-bydfi-2026-two-powerful-exchanges-for-modern-traders/:path*',
        destination: '/comparisons/weex-vs-bydfi',
        permanent: true,
      },
      {
        source: '/best-crypto-exchanges-2025-complete-guide-to-kyc-vs-no-kyc-u-s-options/:path*',
        destination: '/comparisons/best-crypto-exchanges-guide',
        permanent: true,
      },
      {
        source: '/top-5-cryptocurrency-exchanges-for-usa-residents-in-2025/:path*',
        destination: '/comparisons/top-exchanges-usa',
        permanent: true,
      },
      {
        source: '/cex-vs-dex-whats-the-difference-which-should-you-choose-2025-guide/:path*',
        destination: '/comparisons/cex-vs-dex',
        permanent: true,
      },
      {
        source: '/bybit-vs-bingx-2025-which-exchange-wins-for-crypto-trading/:path*',
        destination: '/comparisons/bybit-vs-bingx',
        permanent: true,
      },
      {
        source: '/top-5-no-kyc-crypto-exchanges-in-2025-trade-privately-claim-bonuses/:path*',
        destination: '/no-kyc/best-no-kyc-exchanges',
        permanent: true,
      },

      // --- Bonuses ---
      {
        source: '/best-crypto-exchange-sign-up-bonuses-2026-update/:path*',
        destination: '/bonuses/best-signup-bonuses',
        permanent: true,
      },
      {
        source: '/top-3-crypto-exchange-bonuses-right-now-august/:path*',
        destination: '/bonuses/top-exchange-bonuses',
        permanent: true,
      },

      // --- Old WordPress Category URLs ---
      {
        source: '/category/exchange-reviews/:path*',
        destination: '/reviews',
        permanent: true,
      },
      {
        source: '/category/comparisons/:path*',
        destination: '/comparisons',
        permanent: true,
      },
      {
        source: '/category/no-kyc-exchanges/:path*',
        destination: '/no-kyc',
        permanent: true,
      },
      {
        source: '/category/best-exchange-bonuses/:path*',
        destination: '/bonuses',
        permanent: true,
      },
      {
        source: '/category/referral-bonuses/:path*',
        destination: '/bonuses',
        permanent: true,
      },

      // --- Misc / Off-topic (redirect to homepage) ---
      {
        source: '/19-indoor-recess-games-to-energize-elementary-students/:path*',
        destination: '/',
        permanent: true,
      },

      // --- WordPress system pages ---
      {
        source: '/wp-admin/:path*',
        destination: '/',
        permanent: true,
      },
      {
        source: '/wp-login.php',
        destination: '/',
        permanent: true,
      },
      {
        source: '/wp-content/:path*',
        destination: '/',
        permanent: true,
      },
      {
        source: '/author/:path*',
        destination: '/about',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
