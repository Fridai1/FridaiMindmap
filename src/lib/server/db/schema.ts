import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core';

export const brainItems = sqliteTable('brain_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	text: text('text').notNull(),
	category: text('category', { enum: ['todo', 'thought', 'idea', 'note'] }).notNull(),
	dateAdded: text('date_added').notNull(),
	deadline: text('deadline'),
	priority: integer('priority'),
	project: text('project'),
	x: real('x').notNull(),
	y: real('y').notNull(),
	rotation: real('rotation').notNull(),
	baseX: real('base_x').notNull(),
	baseY: real('base_y').notNull(),
	completedAt: text('completed_at'),
	archivedAt: text('archived_at'),
	recurrence: text('recurrence', { enum: ['daily', 'weekly', 'monthly'] }),
	projectColumn: text('project_column', { enum: ['backlog', 'next', 'doing', 'done'] }),
	promotedDate: text('promoted_date'),
	promotedSlot: text('promoted_slot', { enum: ['major', 'minor'] }),
	deletedAt: text('deleted_at')
});

export const plants = sqliteTable('plants', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	species: text('species'),
	light: text('light', { enum: ['low', 'medium', 'bright_indirect', 'direct'] }).notNull(),
	wateringIntervalDays: integer('watering_interval_days').notNull(),
	waterCount: integer('water_count').default(0),
	lastWatered: text('last_watered'),
	nextWatering: text('next_watering').notNull(),
	notes: text('notes'),
	createdAt: text('created_at').notNull(),
	deletedAt: text('deleted_at')
});

export type BrainItemRow = typeof brainItems.$inferSelect;
export type NewBrainItem = typeof brainItems.$inferInsert;
export type PlantRow = typeof plants.$inferSelect;
export type NewPlant = typeof plants.$inferInsert;
