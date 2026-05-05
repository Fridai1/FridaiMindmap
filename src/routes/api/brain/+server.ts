import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { brainItems } from '$lib/server/db/schema';

const categories = ['todo', 'thought', 'idea', 'note'] as const;
const priorities = [1, 2, 3] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isCategory(value: unknown): value is (typeof categories)[number] {
	return typeof value === 'string' && categories.includes(value as (typeof categories)[number]);
}

function finiteNumber(value: unknown, field: string) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw error(400, `${field} must be a finite number`);
	}
	return value;
}

function optionalIsoDate(value: unknown, field: string) {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
		throw error(400, `${field} must be an ISO date string`);
	}
	return new Date(value).toISOString();
}

function optionalPriority(value: unknown) {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'number' || !priorities.includes(value as (typeof priorities)[number])) {
		throw error(400, 'priority must be 1, 2, or 3');
	}
	return value;
}

function optionalProject(value: unknown) {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') throw error(400, 'project must be a string');
	const project = value.trim().toLowerCase();
	if (!project) return null;
	if (!/^[a-z0-9_-]{1,40}$/.test(project)) {
		throw error(400, 'project must use letters, numbers, underscores, or dashes');
	}
	return project;
}

export async function POST({ request }) {
	const body: unknown = await request.json();
	if (!isRecord(body)) throw error(400, 'request body must be an object');

	if (typeof body.text !== 'string' || !body.text.trim()) {
		throw error(400, 'text is required');
	}
	if (!isCategory(body.category)) {
		throw error(400, 'invalid category');
	}

	const x = finiteNumber(body.x, 'x');
	const y = finiteNumber(body.y, 'y');
	const rotation = finiteNumber(body.rotation, 'rotation');
	const deadline = optionalIsoDate(body.deadline, 'deadline');
	const priority = optionalPriority(body.priority);
	const project = optionalProject(body.project);

	const [item] = await db
		.insert(brainItems)
		.values({
			text: body.text.trim(),
			category: body.category,
			dateAdded: new Date().toISOString(),
			deadline,
			priority,
			project,
			x,
			y,
			rotation,
			baseX: x,
			baseY: y
		})
		.returning();

	return json(item, { status: 201 });
}
