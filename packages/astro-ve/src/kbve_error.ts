export class KbveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'KbveError';

        if(Error.captureStackTrace) {
            Error.captureStackTrace(this, KbveError);
        }

    }
}