import { error } from '@sveltejs/kit';
import {
	CATEGORIES,
	LIGHTS,
	PRIORITIES,
	PROJECT_COLUMNS,
	RECURRENCES,
	type Category,
	type Light,
	type Priority,
	type ProjectColumn,
	type Recurrence
} from '$lib/domain';

export function assertRecord(value: unknown): asserts value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null)
		throw error(400, 'request body must be an object');
}

export function validateCategory(value: unknown): Category {
	if (typeof value !== 'string' || !CATEGORIES.includes(value as Category)) {
		throw error(400, 'invalid category');
	}
	return value as Category;
}

export function validateLight(value: unknown): Light {
	if (typeof value !== 'string' || !LIGHTS.includes(value as Light)) {
		throw error(400, 'invalid light requirement');
	}
	return value as Light;
}

export function validateFiniteNumber(value: unknown, field: string) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw error(400, `${field} must be a finite number`);
	}
	return value;
}

export function validateOptionalIsoDate(value: unknown, field: string, allowUndefined = false) {
	if (value === null || (allowUndefined && value === undefined) || value === '') return null;
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
		throw error(400, `${field} must be an ISO date string or null`);
	}
	return new Date(value).toISOString();
}

export function validateOptionalPriority(value: unknown): Priority | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'number' || !PRIORITIES.includes(value as Priority)) {
		throw error(400, 'priority must be 1, 2, 3, or null');
	}
	return value as Priority;
}

export function validateOptionalProject(value: unknown) {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') throw error(400, 'project must be a string or null');
	const project = value.trim().toLowerCase();
	if (!project) return null;
	if (!/^[a-z0-9_-]{1,40}$/.test(project)) {
		throw error(400, 'project must use letters, numbers, underscores, or dashes');
	}
	return project;
}

export function validateOptionalDateOnly(value: unknown, field: string) {
	if (value === null) return null;
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw error(400, `${field} must be YYYY-MM-DD or null`);
	}
	return value;
}

export function validateOptionalPromotedSlot(value: unknown) {
	if (value === null) return null;
	if (value !== 'major' && value !== 'minor') {
		throw error(400, 'promotedSlot must be major, minor, or null');
	}
	return value;
}

export function validateOptionalRecurrence(value: unknown): Recurrence | null {
	if (value === null) return null;
	if (typeof value !== 'string' || !RECURRENCES.includes(value as Recurrence)) {
		throw error(400, 'recurrence must be daily, weekly, monthly, or null');
	}
	return value as Recurrence;
}

export function validateOptionalProjectColumn(value: unknown): ProjectColumn | null {
	if (value === null) return null;
	if (typeof value !== 'string' || !PROJECT_COLUMNS.includes(value as ProjectColumn)) {
		throw error(400, 'projectColumn must be backlog, next, doing, done, or null');
	}
	return value as ProjectColumn;
}

export function validateText(value: unknown, field: string) {
	if (typeof value !== 'string' || !value.trim()) throw error(400, `${field} is required`);
	return value.trim();
}

export function validateOptionalText(value: unknown, field: string, allowUndefined = false) {
	if (value === null || (allowUndefined && value === undefined)) return null;
	if (typeof value !== 'string') throw error(400, `${field} must be a string or null`);
	const text = value.trim();
	return text || null;
}

export function validateInterval(value: unknown) {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 365) {
		throw error(400, 'wateringIntervalDays must be an integer between 1 and 365');
	}
	return value;
}
