import Alpine from 'alpinejs';
import RegisterAlpineEntrypoints from './entrypoints';

RegisterAlpineEntrypoints(Alpine);

window.Alpine = Alpine;
Alpine.start();