/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@focus-swarm/orchestrator',
    '@focus-swarm/smith',
    '@focus-swarm/synthesizer',
    '@focus-swarm/core',
  ],
  serverExternalPackages: [
    '@0gfoundation/0g-ts-sdk',
    '@0glabs/0g-serving-broker',
    'ethers',
    'better-sqlite3',
  ],
  outputFileTracingRoot: process.cwd().replace(/\/packages\/ui$/, ''),
  webpack: (config) => {
    // workspace TS sources use NodeNext-style `.js` import paths; let webpack rewrite them.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};
export default nextConfig;
