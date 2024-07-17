import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import * as Laser from '@kbve/laser';

interface DialogueEventData {
  npcId?: string;
  dialogue: {
    title: string;
    message: string;
    playerResponse?: string;
    backgroundImage?: string;
  };
}

const $dialogueEvent = atom<DialogueEventData | null>(null);
const $dialogueSession = atom<Record<string, string>>({});

const NPCDialogue: React.FC<{
  text: string;
  onComplete: () => void;
}> = React.memo(({ text, onComplete }) => {
  return <Laser.TypewriterComponent text={text} onComplete={onComplete} />;
});

const PlayerDialogue: React.FC<{
  text: string;
  onComplete: () => void;
}> = React.memo(({ text, onComplete }) => {
  return <Laser.TypewriterComponent text={text} onComplete={onComplete} />;
});

const DialogueComponent: React.FC = () => {
  const dialogue$ = useStore($dialogueEvent);
  const dialogueSession$ = useStore($dialogueSession);
  const [npcTypingComplete, setNpcTypingComplete] = useState(false);
  const [playerTypingComplete, setPlayerTypingComplete] = useState(false);

  useEffect(() => {
    const handleOpenDialogue = (data?: DialogueEventData) => {
      if (data) {
        $dialogueEvent.set(data);
        const overlayElement = document.querySelector(
          '#hs-stacked-overlays-dialogue',
        );
        if (overlayElement) {
          (overlayElement as HTMLElement).classList.remove('hidden');
          (overlayElement as HTMLElement).classList.add('open');
        }
        if (data.npcId) {
          Laser.npcDatabase.createNPCSession($dialogueSession, data.npcId);
          setNpcTypingComplete(false);
          setPlayerTypingComplete(false);
        }
      }
    };

    Laser.EventEmitter.on('npcDialogue', handleOpenDialogue);
    return () => {
      Laser.EventEmitter.off('npcDialogue', handleOpenDialogue);
    };
  }, []);

  const closeDialogue = () => {
    const overlayElement = document.querySelector(
      '#hs-stacked-overlays-dialogue',
    );
    if (overlayElement) {
      (overlayElement as HTMLElement).classList.add('hidden');
      (overlayElement as HTMLElement).classList.remove('open');
    }
    $dialogueEvent.set(null);
    $dialogueSession.set({});
    setNpcTypingComplete(false);
    setPlayerTypingComplete(false);
  };

  return (
    <>
      <div
        id="hs-stacked-overlays-dialogue"
        className="hs-overlay hs-overlay-backdrop-open:bg-gray-900/50 w-full h-full fixed top-0 start-0 z-[60] overflow-x-hidden overflow-y-auto pointer-events-none [--overlay-backdrop:static]"
        data-hs-overlay-keyboard="false"
      >
        <div className="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all w-full h-full sm:max-w-lg sm:w-full m-3 sm:mx-auto md:min-w-fit">
          <div
            className="flex flex-col lg:flex-row bg-zinc-950 border border-yellow-500 shadow-sm rounded-xl pointer-events-auto bg-cover min-w-[800px] min-h-[500px]"
            style={{
              backgroundImage: `url(${dialogue$?.dialogue.backgroundImage || 'https://kbve.com/assets/img/curved-images/wave.jpg'})`,
            }}
          >
            {dialogue$ ? (
              <>
                <div className="w-full lg:w-1/3 p-4 rounded-l-xl flex flex-col items-center justify-center relative">
                  <h3 className="font-bold text-yellow-400 bg-zinc-950/80 rounded-2xl text-center mb-4 p-4 absolute top-2 left-2">
                    {dialogue$.npcId &&
                    dialogueSession$[`${dialogue$.npcId}_name`]
                      ? dialogueSession$[`${dialogue$.npcId}_name`]
                      : 'Unknown'}
                  </h3>
                  <img
                    src={
                      dialogue$.npcId &&
                      dialogueSession$[`${dialogue$.npcId}_avatar`]
                        ? dialogueSession$[`${dialogue$.npcId}_avatar`]
                        : '/assets/npc/barkeep.webp'
                    }
                    alt="Character"
                    className="w-full h-auto rounded-md absolute bottom-0 left-0"
                  />
                </div>

                <div className="w-full md:w-2/3 p-4 bg-cover bg-center rounded-r-xl">
                  <div className="flex justify-between items-center pb-3 border-b">
                    <h3 className="font-bold text-yellow-400 text-shadow-outline-white">
                      {dialogue$.dialogue.title || 'Dialogue'}
                    </h3>
                    <button
                      type="button"
                      className="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-yellow-400 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"
                      data-hs-overlay="#hs-stacked-overlays-dialogue"
                      onClick={closeDialogue}
                    >
                      <span className="sr-only">Close</span>
                      <svg
                        className="flex-shrink-0 size-4"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6 6 18"></path>
                        <path d="m6 6 12 12"></path>
                      </svg>
                    </button>
                  </div>

                  <div className="p-4 overflow-y-auto">
                    <div className="flex flex-col">
                      <div className="mt-1 mb-2 text-white bg-zinc-950/40 text-shadow-outline-white rounded-xl p-4 flex w-1/2">
                        <div className="w-full">
                          {dialogue$.dialogue.message && !npcTypingComplete && (
                            <NPCDialogue
                              text={dialogue$.dialogue.message}
                              onComplete={() => setNpcTypingComplete(true)}
                            />
                          )}
                          {npcTypingComplete && (
                            <div>{dialogue$.dialogue.message}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <div className="w-1/2 mt-1 mb-2 text-yellow-400 text-shadow-outline-whites bg-zinc-950/40 rounded-xl p-4  text-right">
                          {dialogue$.dialogue.playerResponse &&
                            npcTypingComplete &&
                            !playerTypingComplete && (
                              <PlayerDialogue
                                text={`${dialogue$.dialogue.playerResponse}`}
                                onComplete={() => setPlayerTypingComplete(true)}
                              />
                            )}
                          {playerTypingComplete && (
                            <div>{dialogue$.dialogue.playerResponse}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end items-center gap-x-2 py-3 px-4 border-t">
                    <button
                      className="relative rounded px-5 py-2.5 overflow-hidden group bg-yellow-500 relative hover:bg-gradient-to-r hover:from-yellow-500 hover:to-yellow-400 text-white hover:ring-2 hover:ring-offset-2 hover:ring-yellow-400 transition-all ease-out duration-300 disabled:pointer-events-none"
                      data-hs-overlay="#hs-stacked-overlays-dialogue"
                      onClick={closeDialogue}
                      disabled={!playerTypingComplete}
                    >
                      <span className="absolute right-0 w-8 h-32 -mt-12 transition-all duration-1000 transform translate-x-12 bg-white opacity-10 rotate-12 group-hover:-translate-x-40 ease"></span>
                      <span
                        className={`relative ${!playerTypingComplete ? 'text-gray-500' : ''}`}
                      >
                        Okay.
                      </span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full p-4 rounded-xl flex flex-col items-center justify-center">
                <h3 className="font-bold text-yellow-400 bg-zinc-950/80 rounded-2xl text-center mb-4 p-4">
                  Loading...
                </h3>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DialogueComponent;
