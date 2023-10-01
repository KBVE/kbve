import { render } from '@testing-library/react';

import ReactAppwrite from './react-appwrite';

describe('ReactAppwrite', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<ReactAppwrite />);
    expect(baseElement).toBeTruthy();
  });
});
