import { supabase_url, supabase_anon, $registerAtom, $registerAction } from "@kbve/postgres";
import { createClient } from '@supabase/supabase-js';
import { useStore } from '@nanostores/react';
import { Helmet, HelmetProvider, HelmetData } from 'react-helmet-async';
import React, {useEffect} from 'react';



const supabase = createClient(supabase_url, supabase_anon);


export default function KBVERegister() {
    
    const registerAtom$ = useStore($registerAtom);


    useEffect(() => {
        // Your logic here, for example:
        console.log("Current state of registerAtom:", registerAtom$);

        // If you need to perform asynchronous operations or more complex logic,
        // consider defining a function inside the useEffect and then calling it.
        const doSomethingWithNewState = async () => {
            // Asynchronous operation or complex logic with registerAtom
        };

        doSomethingWithNewState();
    }, [registerAtom$]);

    return (
        <div>
            {/* Your JSX here, possibly using registerAtom data */}
        </div>
    );

}
