import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const initWorkers = MeshoptDecoder.useWorkers.bind(MeshoptDecoder);
initWorkers(2);

export { MeshoptDecoder };
