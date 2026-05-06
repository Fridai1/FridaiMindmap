import { json, error } from '@sveltejs/kit';
import { nextWateringDate } from '$lib/domain';
import { db } from '$lib/server/db';
import { plants } from '$lib/server/db/schema';
import {
	assertRecord,
	validateInterval,
	validateLight,
	validateOptionalIsoDate,
	validateOptionalText
} from '$lib/server/validation';

export async function POST({ request }) {
	const body: unknown = await request.json();
	assertRecord(body);

	if (typeof body.name !== 'string' || !body.name.trim()) throw error(400, 'name is required');

	const light = validateLight(body.light);
	const wateringIntervalDays = validateInterval(body.wateringIntervalDays);
	const lastWatered = validateOptionalIsoDate(body.lastWatered, 'lastWatered', true);
	const nextWatering = lastWatered
		? nextWateringDate(new Date(lastWatered), wateringIntervalDays).toISOString()
		: (validateOptionalIsoDate(body.nextWatering, 'nextWatering', true) ??
			nextWateringDate(new Date(), wateringIntervalDays).toISOString());
	const waterCount = lastWatered ? 1 : 0;

	const [plant] = await db
		.insert(plants)
		.values({
			name: body.name.trim(),
			species: validateOptionalText(body.species, 'species', true),
			light,
			wateringIntervalDays,
			waterCount,
			lastWatered,
			nextWatering,
			notes: validateOptionalText(body.notes, 'notes', true),
			createdAt: new Date().toISOString()
		})
		.returning();

	return json(plant, { status: 201 });
}
