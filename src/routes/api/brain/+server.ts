import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { brainItems } from '$lib/server/db/schema';
import {
	assertRecord,
	validateCategory,
	validateFiniteNumber,
	validateOptionalIsoDate,
	validateOptionalPriority,
	validateOptionalProject
} from '$lib/server/validation';

export async function POST({ request }) {
	const body: unknown = await request.json();
	assertRecord(body);

	if (typeof body.text !== 'string' || !body.text.trim()) {
		throw error(400, 'text is required');
	}

	const category = validateCategory(body.category);
	const x = validateFiniteNumber(body.x, 'x');
	const y = validateFiniteNumber(body.y, 'y');
	const rotation = validateFiniteNumber(body.rotation, 'rotation');
	const deadline = validateOptionalIsoDate(body.deadline, 'deadline', true);
	const priority = validateOptionalPriority(body.priority);
	const project = validateOptionalProject(body.project);

	const [item] = await db
		.insert(brainItems)
		.values({
			text: body.text.trim(),
			category,
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
