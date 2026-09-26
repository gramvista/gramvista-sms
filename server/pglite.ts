import { PGlite } from "@electric-sql/pglite";
import type { Database, Row } from "./database.ts";
export function localDatabase(pg: PGlite): Database {
  const ident = (s: string) => {
    if (!/^[a-z_]+$/.test(s)) throw new Error("Invalid identifier");
    return '"' + s + '"';
  };
  const where = (filters: Row, start = 1) =>
    Object.keys(filters)
      .map((k, i) => `${ident(k)} = $${i + start}`)
      .join(" and ");
  return {
    async list(table, filters = {}, options = {}) {
      const values = Object.values(filters);
      return (
        await pg.query<Row>(
          `select * from ${ident(table)} ${values.length ? "where " + where(filters) : ""} ${options.order ? "order by " + ident(options.order) + (options.asc ? " asc" : " desc") : ""} limit ${Math.min(options.limit ?? 50, 10000)} offset ${Math.max(options.offset ?? 0, 0)}`,
          values,
        )
      ).rows;
    },
    async insert(table, value) {
      const keys = Object.keys(value);
      return (
        await pg.query<Row>(
          `insert into ${ident(table)} (${keys.map(ident).join(",")}) values (${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
          Object.values(value).map((v) =>
            v && typeof v === "object" && !Array.isArray(v)
              ? JSON.stringify(v)
              : v,
          ),
        )
      ).rows[0];
    },
    async update(table, filters, value) {
      if (!Object.keys(filters).length) throw new Error("Missing filter");
      return (
        await pg.query<Row>(
          `update ${ident(table)} set ${Object.keys(value)
            .map((k, i) => ident(k) + "=$" + (i + 1))
            .join(
              ",",
            )} where ${where(filters, Object.keys(value).length + 1)} returning *`,
          [...Object.values(value), ...Object.values(filters)],
        )
      ).rows;
    },
    async remove(table, filters) {
      if (!Object.keys(filters).length) throw new Error("Missing filter");
      await pg.query(
        `delete from ${ident(table)} where ${where(filters)}`,
        Object.values(filters),
      );
    },
    async rpc(name, args) {
      return (
        await pg.query<{ result: any }>(
          `select ${ident(name)}(${Object.keys(args)
            .map((k, i) => ident(k) + " := $" + (i + 1))
            .join(",")}) as result`,
          Object.values(args).map((v) =>
            v && typeof v === "object" && !Array.isArray(v)
              ? JSON.stringify(v)
              : v,
          ),
        )
      ).rows[0].result;
    },
  };
}
