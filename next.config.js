const path = require('path');

module.exports = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/public/:path*',
        destination: '/:path*',
      },
      // Local dev fallback only — all API endpoints have Next.js route handlers
      // that use apiFetch() with identity token auth. This rewrite only applies
      // in local dev when NEXT_PUBLIC_API_BASE_URL is not set and only for
      // paths that don't match an existing route handler.
      // NOTE: Next.js rewrites do NOT override existing file-based API routes,
      // so this only catches unhandled /api/* paths.
      ...(process.env.NEXT_PUBLIC_API_BASE_URL
        ? []
        : [
            {
              source: '/api/:path*',
              destination: 'http://localhost:8000/api/:path*',
            },
          ]),
    ];
  },
  reactStrictMode: false,
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // The following aliases are added to ensure that both the Next.js instance and
      // the `veda-ui` library use the same instances of Jotai for state management.
      // This resolves the issue of "Detected multiple Jotai instances," which can cause
      // unexpected behavior due to multiple instances of Jotai's default store.
      // For more details, refer to the GitHub discussion:
      // https://github.com/pmndrs/jotai/discussions/2044
      jotai: path.resolve(__dirname, 'node_modules', 'jotai'),
      'jotai-devtools': path.resolve(
        __dirname,
        'node_modules',
        'jotai-devtools',
      ),
      'jotai-location': path.resolve(
        __dirname,
        'node_modules',
        'jotai-location',
      ),
      'jotai-optics': path.resolve(__dirname, 'node_modules', 'jotai-optics'),
    };
    return config;
  },
  sassOptions: {
    includePaths: [
      'node_modules/@uswds/uswds',
      'node_modules/@uswds/uswds/dist',
      'node_modules/@uswds/uswds/packages',
    ],
  },
};
