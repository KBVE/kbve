import React, { useState, useEffect } from 'react';

const LoadTravelBox = () => {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (loaded) return; // Prevent further action if already loaded

        // Create the div inside block-a
        const container = document.getElementById('block-a');
        if (!container) return; // Ensure container exists

        const div = document.createElement('div');
        div.id = 'travelbox';
        container.appendChild(div);

        // Dynamically load the script
        const script = document.createElement('script');
        script.src = '/embed/js/travelbox/travelbox.js';
        script.type = 'module';
        script.async = true; // Ensure the script is loaded asynchronously
        script.onload = () => setLoaded(true); // Mark as loaded on successful load
        document.body.appendChild(script);
    }, [loaded]); // Dependency array ensures effect only re-runs if loaded changes

    return (
        <div>
            <button onClick={() => setLoaded(true)}>Load Travelbox</button>
            {loaded && <p>Travelbox Loaded!</p>}
        </div>
    );
};

export default LoadTravelBox;
