import styled from 'styled-components';

/* eslint-disable-next-line */
export interface ReactAppwriteProps {}

const StyledReactAppwrite = styled.div`
  color: pink;
`;

export function ReactAppwrite(props: ReactAppwriteProps) {
  return (
    <StyledReactAppwrite>
      <h1>Welcome to ReactAppwrite!</h1>
    </StyledReactAppwrite>
  );
}

export default ReactAppwrite;
