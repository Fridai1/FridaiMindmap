import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { nextRecurringDeadline } from '$lib/domain';
import { db } from '$lib/server/db';
import { brainItems, type NewBrainItem } from '$lib/server/db/schema';
import {
	assertRecord,
	validateCategory,
	validateFiniteNumber,
	validateOptionalDateOnly,
	validateOptionalIsoDate,
	validateOptionalPriority,
	validateOptionalProject,
	validateOptionalProjectColumn,
	validateOptionalPromotedSlot,
	validateOptionalRecurrence
} from '$lib/server/validation';

type BrainItemUpdate = Partial<
	Pick<
		NewBrainItem,
		| 'text'
		| 'category'
		| 'deadline'
		| 'priority'
		| 'project'
		| 'x'
		| 'y'
		| 'rotation'
		| 'baseX'
		| 'baseY'
		| 'completedAt'
		| 'archivedAt'
		| 'recurrence'
		| 'projectColumn'
		| 'promotedDate'
		| 'promotedSlot'
	>
>;

export async function PATCH({ request, params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'invalid id');

	const body: unknown = await request.json();
	assertRecord(body);

	const update: BrainItemUpdate = {};

	if ('text' in body) {
		if (typeof body.text !== 'string' || !body.text.trim()) throw error(400, 'text is required');
		update.text = body.text.trim();
	}
	if ('category' in body) update.category = validateCategory(body.category);
	if ('deadline' in body) update.deadline = validateOptionalIsoDate(body.deadline, 'deadline');
	if ('priority' in body) update.priority = validateOptionalPriority(body.priority);
	if ('project' in body) update.project = validateOptionalProject(body.project);
	if ('x' in body) update.x = validateFiniteNumber(body.x, 'x');
	if ('y' in body) update.y = validateFiniteNumber(body.y, 'y');
	if ('baseX' in body) update.baseX = validateFiniteNumber(body.baseX, 'baseX');
	if ('baseY' in body) update.baseY = validateFiniteNumber(body.baseY, 'baseY');
	if ('rotation' in body) update.rotation = validateFiniteNumber(body.rotation, 'rotation');
	if ('completedAt' in body)
		update.completedAt = validateOptionalIsoDate(body.completedAt, 'completedAt');
	if ('archivedAt' in body)
		update.archivedAt = validateOptionalIsoDate(body.archivedAt, 'archivedAt');
	if ('recurrence' in body) update.recurrence = validateOptionalRecurrence(body.recurrence);
	if ('projectColumn' in body)
		update.projectColumn = validateOptionalProjectColumn(body.projectColumn);
	if ('promotedDate' in body)
		update.promotedDate = validateOptionalDateOnly(body.promotedDate, 'promotedDate');
	if ('promotedSlot' in body) update.promotedSlot = validateOptionalPromotedSlot(body.promotedSlot);

	if (Object.keys(update).length === 0) throw error(400, 'nothing to update');

	if (update.completedAt) {
		const [item] = await db
			.select()
			.from(brainItems)
			.where(and(eq(brainItems.id, id), isNull(brainItems.deletedAt)))
			.limit(1);
		if (item?.recurrence) {
			update.completedAt = null;
			update.deadline = nextRecurringDeadline(new Date(), item.recurrence).toISOString();
			update.promotedDate = null;
			update.promotedSlot = null;
		}
	}

	const [item] = await db
		.update(brainItems)
		.set(update)
		.where(and(eq(brainItems.id, id), isNull(brainItems.deletedAt)))
		.returning();
	if (!item) throw error(404, 'brain item not found');
	return json(item);
}

export async function DELETE({ params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'invalid id');

	const [item] = await db
		.update(brainItems)
		.set({ deletedAt: new Date().toISOString() })
		.where(and(eq(brainItems.id, id), isNull(brainItems.deletedAt)))
		.returning();
	if (!item) throw error(404, 'brain item not found');
	return json(item);
}
