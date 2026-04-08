import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const scenes = pgTable("scenes", {
  id: varchar("id", { length: 12 }).primaryKey(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
