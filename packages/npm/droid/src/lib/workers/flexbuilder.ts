import { Builder as FlexBuilder } from 'flatbuffers/js/flexbuffers/builder';
export { toReference } from 'flatbuffers/js/flexbuffers/reference';

export function builder(): FlexBuilder {
  return new FlexBuilder();
}