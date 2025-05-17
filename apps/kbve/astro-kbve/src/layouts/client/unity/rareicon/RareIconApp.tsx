/** @jsxImportSource react */
import { Unity, useUnityContext } from 'react-unity-webgl';

export default function UnityPlayer() {
  const { unityProvider, loadingProgression, isLoaded } = useUnityContext({
    loaderUrl: 'https://unity.rareicon.com/Build/WebGL.loader.js',
    dataUrl: 'https://unity.rareicon.com/Build/WebGL.data',
    frameworkUrl: 'https://unity.rareicon.com/Build/WebGL.framework.js',
    codeUrl: 'https://unity.rareicon.com/Build/WebGL.wasm',
  });

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
