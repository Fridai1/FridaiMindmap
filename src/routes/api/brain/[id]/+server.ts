import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { brainItems, type NewBrainItem } from '$lib/server/db/schema';

const categories = ['todo', 'thought', 'idea', 'note'] as const;
const priorities = [1, 2, 3] as const;
const recurrences = ['daily', 'weekly', 'monthly'] as const;
const projectColumns = ['backlog', 'next', 'doing', 'done'] as const;

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isCategory(value: unknown): value is (typeof categories)[number] {
	return typeof value === 'string' && categories.includes(value as (typeof categories)[number]);
}

function validateNumber(value: unknown, field: string) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw error(400, `${field} must be a finite number`);
	}
	return value;
}

function validateOptionalIsoDate(value: unknown, field: string) {
	if (value === null) return null;
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
		throw error(400, `${field} must be an ISO date string or null`);
	}
	return new Date(value).toISOString();
}

function validateOptionalPriority(value: unknown) {
	if (value === null) return null;
	if (typeof value !== 'number' || !priorities.includes(value as (typeof priorities)[number])) {
		throw error(400, 'priority must be 1, 2, 3, or null');
	}
	return value;
}

function validateOptionalProject(value: unknown) {
	if (value === null) return null;
	if (typeof value !== 'string') throw error(400, 'project must be a string or null');
	const project = value.trim().toLowerCase();
	if (!project) return null;
	if (!/^[a-z0-9_-]{1,40}$/.test(project)) {
		throw error(400, 'project must use letters, numbers, underscores, or dashes');
	}
	return project;
}

function validateOptionalDateOnly(value: unknown, field: string) {
	if (value === null) return null;
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw error(400, `${field} must be YYYY-MM-DD or null`);
	}
	return value;
}

function validateOptionalPromotedSlot(value: unknown) {
	if (value === null) return null;
	if (value !== 'major' && value !== 'minor')
		throw error(400, 'promotedSlot must be major, minor, or null');
	return value;
}

function validateOptionalRecurrence(value: unknown) {
	if (value === null) return null;
	if (typeof value !== 'string' || !recurrences.includes(value as (typeof recurrences)[number])) {
		throw error(400, 'recurrence must be daily, weekly, monthly, or null');
	}
	return value as (typeof recurrences)[number];
}

function validateOptionalProjectColumn(value: unknown) {
	if (value === null) return null;
	if (
		typeof value !== 'string' ||
		!projectColumns.includes(value as (typeof projectColumns)[number])
	) {
		throw error(400, 'projectColumn must be backlog, next, doing, done, or null');
	}
	return value as (typeof projectColumns)[number];
}

function nextRecurringDeadline(from: Date, recurrence: (typeof recurrences)[number]) {
	const days = recurrence === 'daily' ? 1 : recurrence === 'weekly' ? 7 : 30;
	return new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 12).toISOString();
}

export async function PATCH({ request, params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'invalid id');

	const body: unknown = await request.json();
	if (!isRecord(body)) throw error(400, 'request body must be an object');

	const update: BrainItemUpdate = {};

	if ('text' in body) {
		if (typeof body.text !== 'string' || !body.text.trim()) throw error(400, 'text is required');
		update.text = body.text.trim();
	}
	if ('category' in body) {
		if (!isCategory(body.category)) throw error(400, 'invalid category');
		update.category = body.category;
	}
	if ('deadline' in body) update.deadline = validateOptionalIsoDate(body.deadline, 'deadline');
	if ('priority' in body) update.priority = validateOptionalPriority(body.priority);
	if ('project' in body) update.project = validateOptionalProject(body.project);
	if ('x' in body) update.x = validateNumber(body.x, 'x');
	if ('y' in body) update.y = validateNumber(body.y, 'y');
	if ('baseX' in body) update.baseX = validateNumber(body.baseX, 'baseX');
	if ('baseY' in body) update.baseY = validateNumber(body.baseY, 'baseY');
	if ('rotation' in body) update.rotation = validateNumber(body.rotation, 'rotation');
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
		const [item] = await db.select().from(brainItems).where(eq(brainItems.id, id)).limit(1);
		if (item?.recurrence) {
			update.completedAt = null;
			update.deadline = nextRecurringDeadline(new Date(), item.recurrence);
			update.promotedDate = null;
			update.promotedSlot = null;
		}
	}

	await db.update(brainItems).set(update).where(eq(brainItems.id, id));
	return json({ ok: true });
}

export async function DELETE({ params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'invalid id');

	await db
		.update(brainItems)
		.set({ deletedAt: new Date().toISOString() })
		.where(eq(brainItems.id, id));
	return json({ ok: true });
}
