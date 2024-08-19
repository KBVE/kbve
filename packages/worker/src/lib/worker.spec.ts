import { worker } from './worker';

describe('worker', () => {
  it('should work', () => {
    expect(worker()).toEqual('worker');
  });
});
