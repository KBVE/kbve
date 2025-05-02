import { Builder as FlexBuilder } from 'flatbuffers/ts/flexbuffers/builder';
export { toReference } from 'flatbuffers/ts/flexbuffers/reference';

export function builder(): FlexBuilder {
  return new FlexBuilder();
}