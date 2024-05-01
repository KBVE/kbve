import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';


// Create an atom store to hold the ULID
//const ulidStore = atom(null);
const ulidinvoicestore = persistentAtom('ulidinvoicestore', null);
const ulidinvoicedatestore = persistentAtom('ulidinvoicedatestore', null);

function decodeBase32(str) {
    const base32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32
    let result = 0;
    for (let i = 0; i < str.length; i++) {
        result = result * 32 + base32.indexOf(str[i]);
    }
    return result;
}

function ulidToDate(ulid) {
    const timestampStr = ulid.slice(0, 10); // Extract timestamp part
    const timestamp = decodeBase32(timestampStr); // Convert from base32 to decimal
    return new Date(timestamp); // Convert to Date object
}


// Function to update the ulidStore based on the URL hash
function updateUlidStore() {
    try {
        const hash = window.location.hash;
        const potentialUlid = hash.substring(1).trim(); 
        const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/; 

        if (ulidRegex.test(potentialUlid)) {
            ulidinvoicestore.set(potentialUlid); 
            const __date = ulidToDate(potentialUlid);
            ulidinvoicedatestore.set(__date);
        } else {
            throw new Error("Invalid ULID format.");
        }
    } catch (error) {
        console.error("Error extracting ULID:", error.message);
        ulidinvoicestore.set(null); 
        ulidinvoicedatestore.set(null);
    }
}

// Add event listener for URL hash changes
window.addEventListener('hashchange', updateUlidStore);

// Initial update on page load
updateUlidStore();

// Exporting the ulidStore for use in other parts of the application
export { ulidinvoicestore, ulidinvoicedatestore };