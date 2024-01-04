import { kbve_v01d } from '@kbve/khashvault';
import { useEffect } from 'react';

const KB = () => {
	useEffect(() => {
		console.log(kbve_v01d);
	}, []);
	return <div>{/* KB */}</div>;
};

export default KB;
