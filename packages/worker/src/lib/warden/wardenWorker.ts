import * as Comlink from 'comlink';
import { WardenImpl } from './wardenImplementation';

// The purpose of this file is to expose the Warden logic within a worker context.

const warden = new WardenImpl();

Comlink.expose(warden);