import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';


// Create an atom store to hold the ULID
//const ulidStore = atom(null);
const ulidinvoicestore = persistentAtom('ulidinvoicestore', null);


// Function to update the ulidStore based on the URL hash
function updateUlidStore() {
    try {
        const hash = window.location.hash;
        const potentialUlid = hash.substring(1).trim(); 
        const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/; 

        if (ulidRegex.test(potentialUlid)) {
            ulidinvoicestore.set(potentialUlid); 
        } else {
            throw new Error("Invalid ULID format.");
        }
    } catch (error) {
        console.error("Error extracting ULID:", error.message);
        ulidinvoicestore.set(null); 
    }
}

// Add event listener for URL hash changes
window.addEventListener('hashchange', updateUlidStore);

// Initial update on page load
updateUlidStore();

// Exporting the ulidStore for use in other parts of the application
export { ulidinvoicestore };