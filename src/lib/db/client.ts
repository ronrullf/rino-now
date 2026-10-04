import "server-only";
import { Repository } from "./repository";
import { config } from "../config";
const globalDb = globalThis as typeof globalThis & {
  comparatorDb?: Repository;
};
export function repository() {
  return (globalDb.comparatorDb ??= new Repository(
    config.DATABASE_PATH !== ":memory:" && config.DATA_MODE === "fixture"
      ? config.DATABASE_PATH + ".fixture"
      : config.DATABASE_PATH,
  ));
}
