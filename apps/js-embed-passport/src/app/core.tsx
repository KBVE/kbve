import React from "react";

export const Core = () => {

    const mounted = React.useRef(false);

    //  ! Mounted Placeholder

    React.useEffect( () => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    return (
        <div>
            
        </div>
    )



}

export default Core;