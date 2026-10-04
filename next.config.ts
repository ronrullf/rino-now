import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  outputFileTracingIncludes: { "/api/**": ["./drizzle/*.sql"] },
};
export default config;
