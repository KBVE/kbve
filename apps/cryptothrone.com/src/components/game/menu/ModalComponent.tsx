// ModalComponent.tsx
import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {atom, type WritableAtom } from 'nanostores';
import { eventEmitterInstance as EventEmitter, type CharacterEventData } from '@kbve/laser';


const $modalEvent = atom<CharacterEventData>({
  message: ''
});

const ModalComponent: React.FC = () => {
  const modal$ = useStore($modalEvent)

  useEffect(() => {
    const handleOpenModal = (data?: CharacterEventData) => {
      if (data) {
        $modalEvent.set(data);
        const overlayElement = document.querySelector('#hs-stacked-overlays');
        if (overlayElement) {
          (overlayElement as HTMLElement).classList.remove('hidden');
          (overlayElement as HTMLElement).classList.add('open');
        }
      }
    };

    EventEmitter.on('charEvent', handleOpenModal);
    return () => {
      EventEmitter.off('charEvent', handleOpenModal);
    };
  }, []);

  const closeModal = () => {
    const overlayElement = document.querySelector('#hs-stacked-overlays');
    if (overlayElement) {
      (overlayElement as HTMLElement).classList.add('hidden');
      (overlayElement as HTMLElement).classList.remove('open');
    }
  };

  return (
    <>
      <div id="hs-stacked-overlays" className="hs-overlay hs-overlay-backdrop-open:bg-gray-900/50 hidden size-full fixed top-0 start-0 z-[60] overflow-x-hidden overflow-y-auto pointer-events-none [--overlay-backdrop:static]" data-hs-overlay-keyboard="false">
        <div className="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto">
          <div className="flex flex-col lg:flex-row  bg-zinc-950 border border-yellow-500 shadow-sm rounded-xl pointer-events-auto bg-cover" style={{backgroundImage: `url(${modal$.background_image || "https://kbve.com/assets/img/curved-images/wave.jpg"})`}}>

            
            <div className="w-full lg:w-1/3 p-4 rounded-l-xl flex flex-col items-center justify-center">
              <h3 className="font-bold text-yellow-400 bg-zinc-950/80 rounded-2xl text-center mb-4">
              {`${modal$.character_name || 'NPC'}`}
              </h3>
              <img src={modal$.character_image || '/assets/npc/barkeep.webp'} alt="Character" className="w-full h-auto rounded-md" />
            </div>

            <div className="w-full lg:w-2/3 p-4 bg-cover bg-center rounded-r-xl">
              <div className="flex justify-between items-center pb-3 border-b">
                <h3 className="font-bold text-yellow-400">
                  {``}
                </h3>
                <button type="button" className="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-yellow-400 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none" data-hs-overlay="#hs-stacked-overlays" onClick={closeModal}>
                  <span className="sr-only">Close</span>
                  <svg className="flex-shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path>
                  </svg>
                </button>
              </div>

            <div className="p-4 overflow-y-auto">
              <p className="mt-1 mb-2 text-yellow-400 bg-zinc-950/80 rounded-xl p-4">
                {modal$.message || 'No Message'}
              </p>
            </div>

            <div className="flex justify-end items-center gap-x-2 py-3 px-4 border-t">
              <button className="relative rounded px-5 py-2.5 overflow-hidden group bg-yellow-500 relative hover:bg-gradient-to-r hover:from-yellow-500 hover:to-yellow-400 text-white hover:ring-2 hover:ring-offset-2 hover:ring-yellow-400 transition-all ease-out duration-300 disabled:pointer-events-none" data-hs-overlay="#hs-stacked-overlays" onClick={closeModal}>
              <span className="absolute right-0 w-8 h-32 -mt-12 transition-all duration-1000 transform translate-x-12 bg-white opacity-10 rotate-12 group-hover:-translate-x-40 ease"></span>
              <span className="relative">Okay.</span>
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ModalComponent;
