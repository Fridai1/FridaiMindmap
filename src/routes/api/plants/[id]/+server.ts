import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { nextWateringDate } from '$lib/domain';
import { db } from '$lib/server/db';
import { plants, type NewPlant } from '$lib/server/db/schema';
import {
	assertRecord,
	validateInterval,
	validateLight,
	validateOptionalIsoDate,
	validateOptionalText,
	validateText
} from '$lib/server/validation';

type PlantUpdate = Partial<
	Pick<
		NewPlant,
		| 'name'
		| 'species'
		| 'light'
		| 'wateringIntervalDays'
		| 'waterCount'
		| 'lastWatered'
		| 'nextWatering'
		| 'notes'
	>
>;

export async function PATCH({ request, params }) {
	const id = parseInt(params.id);
	if (Number.isNaN(id)) throw error(400, 'invalid id');

	const body: unknown = await request.json();
	assertRecord(body);

	const update: PlantUpdate = {};
	if ('name' in body) update.name = validateText(body.name, 'name');
	if ('species' in body) update.species = validateOptionalText(body.species, 'species');
	if ('light' in body) update.light = validateLight(body.light);
	if ('wateringIntervalDays' in body)
		update.wateringIntervalDays = validateInterval(body.wateringIntervalDays);
	if ('lastWatered' in body)
		update.lastWatered = validateOptionalIsoDate(body.lastWatered, 'lastWatered');
	if ('nextWatering' in body)
		update.nextWatering = validateOptionalIsoDate(body.nextWatering, 'nextWatering') ?? undefined;
	if ('notes' in body) update.notes = validateOptionalText(body.notes, 'notes');

	if (body.wateredToday === true) {
		const [plant] = await db
			.select()
			.from(plants)
			.where(and(eq(plants.id, id), isNull(plants.deletedAt)))
			.limit(1);
		if (!plant) throw error(404, 'plant not found');
		const wateredAt = new Date();
		update.lastWatered = wateredAt.toISOString();
		update.nextWatering = nextWateringDate(wateredAt, plant.wateringIntervalDays).toISOString();
		update.waterCount = (plant.waterCount ?? 0) + 1;
	}

	if (Object.keys(update).length === 0) throw error(400, 'nothing to update');

	const [plant] = await db
		.update(plants)
		.set(update)
		.where(and(eq(plants.id, id), isNull(plants.deletedAt)))
		.returning();
	if (!plant) throw error(404, 'plant not found');
	return json(plant);
}

export async function DELETE({ params }) {
	const id = parseInt(params.id);
	if (Number.isNaN(id)) throw error(400, 'invalid id');

	const [plant] = await db
		.update(plants)
		.set({ deletedAt: new Date().toISOString() })
		.where(and(eq(plants.id, id), isNull(plants.deletedAt)))
		.returning();
	if (!plant) throw error(404, 'plant not found');
	return json(plant);
}
