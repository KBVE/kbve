/* cspell:disable */
/* PUBLIC CONFIGURATIONS */
export type kbveLocker = {
    /* core */
    username: string,
    uuid: string,
    email: string,
    /* profile */
    avatar: string,
    github: string,
    instagram: string,
    bio: string,
    pgp: string,
    unsplash: string,
}

export const kbve_v01d: string = '1';








export const auth_register: string = '/api/v1/auth/register';
export const auth_login: string = '/api/v1/auth/login';
