import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn/ui `cn` utility — merges Tailwind classes with clsx.
 * Works even without Tailwind (clsx handles conditional classes fine).
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
