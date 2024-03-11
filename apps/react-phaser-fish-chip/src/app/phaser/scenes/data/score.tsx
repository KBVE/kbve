
import { persistentAtom } from '@nanostores/persistent'

export type ScoreEntry = {
    wpm: number,
    score: number
}

export const score = persistentAtom<ScoreEntry>('score', { wpm: 0, score: 0 }, {
    encode(value: ScoreEntry) {
        return JSON.stringify(value);
    },
    decode(value: string): ScoreEntry {
        try {
            const parsed = JSON.parse(value);
            // Basic validation to check if parsed object matches the ScoreEntry structure
            if (typeof parsed.wpm === 'number' && typeof parsed.score === 'number') {
                return parsed;
            } else {
                // Return a default value or handle error appropriately
                console.error('Decoded value does not match ScoreEntry structure, returning default value.');
                return { wpm: 0, score: 0 };
            }
        } catch (e) {
            // Return a default value or handle error appropriately in case of parsing error
            console.error('Error parsing value, returning default value.', e);
            return { wpm: 0, score: 0 };
        }
    }
});
