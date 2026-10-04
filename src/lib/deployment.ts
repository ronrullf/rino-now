export function deploymentSettings(env: Record<string, string | undefined>) {
  const serverless = env.VERCEL === "1";
  return {
    serverless,
    databasePath: serverless
      ? ":memory:"
      : env.DATABASE_PATH || "./data/xbox-comparator.sqlite",
    // Explicit APP_ORIGIN supports custom domains. Otherwise Vercel's trusted
    // deployment domains are validated by the origin guard.
    appOrigin:
      env.APP_ORIGIN ||
      (env.VERCEL_PROJECT_PRODUCTION_URL
        ? "https://" + env.VERCEL_PROJECT_PRODUCTION_URL
        : env.VERCEL_URL
          ? "https://" + env.VERCEL_URL
          : "http://127.0.0.1:3000"),
    allowedOrigins: [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
      .filter(Boolean)
      .map((host) => "https://" + host),
  };
}
