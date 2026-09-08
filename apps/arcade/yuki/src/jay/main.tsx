import { createRoot } from 'react-dom/client';
import ReactJayYuki from './ReactJayYuki';

const host = document.getElementById('jay-root');
if (host) {
	createRoot(host).render(<ReactJayYuki />);
}
