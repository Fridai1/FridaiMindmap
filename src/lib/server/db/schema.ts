import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core';

export const brainItems = sqliteTable('brain_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	text: text('text').notNull(),
	category: text('category', { enum: ['todo', 'thought', 'idea', 'note'] }).notNull(),
	dateAdded: text('date_added').notNull(),
	x: real('x').notNull(),
	y: real('y').notNull(),
	rotation: real('rotation').notNull(),
	baseX: real('base_x').notNull(),
	baseY: real('base_y').notNull()
});

export type BrainItemRow = typeof brainItems.$inferSelect;
export type NewBrainItem = typeof brainItems.$inferInsert;
