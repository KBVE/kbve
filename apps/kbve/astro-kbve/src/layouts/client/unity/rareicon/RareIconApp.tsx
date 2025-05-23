/** @jsxImportSource react */
import { Unity, useUnityContext } from 'react-unity-webgl';
import { useEffect } from 'react';
// import { useStore } from '@nanostores/react';
//import { $deployable } from './store';
import { registerUnityBridge, unregisterUnityBridge } from './bridge';


export default function UnityPlayer() {

  //const deployable = useStore($deployable);

  
  const { unityProvider, loadingProgression, isLoaded } = useUnityContext({
    loaderUrl: 'https://unity.rareicon.com/Build/WebGL.loader.js',
    dataUrl: 'https://unity.rareicon.com/Build/WebGL.data',
    frameworkUrl: 'https://unity.rareicon.com/Build/WebGL.framework.js',
    codeUrl: 'https://unity.rareicon.com/Build/WebGL.wasm',
    streamingAssetsUrl: 'https://unity.rareicon.com/StreamingAssets'
  });

  useEffect(() => {
    registerUnityBridge();
    return unregisterUnityBridge;
  }, []);

  return (
    <>
      {!isLoaded && (
        <p>
          Loading Application... {Math.round(loadingProgression * 100)}%
        </p>
      )}
      <Unity
        unityProvider={unityProvider}
        style={{
          visibility: isLoaded ? 'visible' : 'hidden',
          width: '100%',
          height: '100%',
        }}
      />
    </>
  );
}
