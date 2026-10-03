import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { Repository } = await import("../src/lib/db/repository");
const path =
  (process.env.DATABASE_PATH ?? "./data/xbox-comparator.sqlite") +
  (process.env.DATA_MODE === "fixture" ? ".fixture" : "");
const db = new Repository(path);
db.close();
console.log("SQLite migrations applied.");
