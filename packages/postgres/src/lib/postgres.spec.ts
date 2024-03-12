import { postgres } from './postgres';

describe('postgres', () => {
    it('should work', () => {
        expect(postgres()).toEqual('postgres');
    })
})