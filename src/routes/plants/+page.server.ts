import { asc, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { plants } from '$lib/server/db/schema';

export async function load() {
	const rows = await db
		.select()
		.from(plants)
		.where(isNull(plants.deletedAt))
		.orderBy(asc(plants.nextWatering));
	return { plants: rows };
}
