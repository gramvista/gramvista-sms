export type Row = Record<string, any>;
export interface Database {
  list(
    table: string,
    filters?: Row,
    options?: {
      limit?: number;
      offset?: number;
      order?: string;
      asc?: boolean;
    },
  ): Promise<Row[]>;
  insert(table: string, value: Row): Promise<Row>;
  update(table: string, filters: Row, value: Row): Promise<Row[]>;
  remove(table: string, filters: Row): Promise<void>;
  rpc(name: string, args: Row): Promise<any>;
}
