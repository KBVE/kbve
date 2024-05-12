import React, { useState } from 'react';

const WebmasterTool = () => {
	const [url, setUrl] = useState('');

	const handleUrlChange = (event) => {
		setUrl(event.target.value);
	};

	const getRootDomain = (url) => {
        let hostname;
        // Find & remove protocol (http, ftp, etc.) and get hostname
        if (url.indexOf("//") > -1) {
            hostname = url.split('/')[2];
        } else {
            hostname = url.split('/')[0];
        }
        // Find & remove port number
        hostname = hostname.split(':')[0];
        // Find & remove "?"
        hostname = hostname.split('?')[0];

        // Split the hostname into parts to remove any subdomains
        const parts = hostname.split('.').reverse();
        if (parts != null && parts.length > 1) {
            hostname = parts[1] + '.' + parts[0];
            // Check to handle .co.uk, .com.au, etc.
            if (parts.length > 2 && parts[1].length < 4) {
                hostname = parts[2] + '.' + hostname;
            }
        }
        return hostname;
    };


	const searchUrls = {
		google: 'https://www.google.com/search?q=site:{url}',
		bing: 'https://www.bing.com/search?q=site:{url}',
		yahoo: 'https://search.yahoo.com/search?p=site:{url}',
		ahrefs: 'https://ahrefs.com/backlink-checker/?input={url}&mode=subdomains',
		googleconsole:
			'https://search.google.com/search-console/index?resource_id=sc-domain%3A{root}',
		pagespeeddev: 'https://developers.google.com/speed/pagespeed/insights/?url={url}'
		// Add more configurations here if needed
	};

	const openSearch = (searchType) => {
        if (!url) {
            alert('Please enter a URL.');
            return;
        }

        const rootDomain = getRootDomain(url);
        let searchUrl = searchUrls[searchType];
        searchUrl = searchUrl.replace('{url}', encodeURIComponent(url));
        searchUrl = searchUrl.replace('{root}', encodeURIComponent(rootDomain));

        window.open(searchUrl, '_blank');
    };


	const operations = [
		{ name: 'PageSpeed Web Dev Test', type: 'pagespeeddev'},
		{ name: 'Google Search Index', type: 'google' },
		{ name: 'Google WebMaster Console', type: 'googleconsole' },
		{ name: 'Bing Search Index', type: 'bing' },
		{ name: 'Yahoo Search Index', type: 'yahoo' },
		{ name: 'Ahrefs Backlink Check', type: 'ahrefs' },
		// Add more operations as needed
	];

	const openAllSearches = () => {
        if (!url) {
            alert('Please enter a URL.');
            return;
        }
		const delay = 500;
        const rootDomain = getRootDomain(url);
		Object.values(searchUrls).forEach((templateUrl, index) => {
			setTimeout(() => {
				let searchUrl = templateUrl.replace('{url}', encodeURIComponent(url));
				searchUrl = searchUrl.replace('{root}', encodeURIComponent(rootDomain));
				window.open(searchUrl, '_blank');
			}, index * delay);
		});
    };

	return (
		<div className="flex flex-col">
			<div className="p-4">
				<input
					type="text"
					value={url}
					onChange={handleUrlChange}
					placeholder="Enter website URL"
					className="text-sm p-2 border rounded-md w-full text-gray-300 bg-[var(--sl-color-black)]"
				/>
				 <button
                    type="button"
                    onClick={openAllSearches}
                    className="mt-2 w-full p-2 rounded border hover:scale-110 ease-in-out duration-500">
                    Open All Searches
                </button>
			</div>
			
			<span className="p-2 text-lg">Manual Action</span>

			<div className="-m-1.5 overflow-x-auto">
				<div className="p-1.5 min-w-full inline-block align-middle">
					<div className="overflow-hidden">
						<table className="!min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
							<thead>
								<tr>
									<th
										scope="col"
										className="px-6 py-3 text-start text-xs font-medium  uppercase">
										Operation
									</th>
									<th
										scope="col"
										className="px-6 py-3 text-end text-xs font-medium  uppercase">
										Action
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
								{operations.map((operation) => (
									<tr
										key={operation.type}
										className="">
										<td className="px-6 py-4 whitespace-nowrap text-sm font-medium ">
											{operation.name}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-end text-sm font-medium">
											<button
												type="button"
												className="inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border p-2 hover:scale-110 ease-in-out duration-300 disabled:opacity-50 disabled:pointer-events-none"
												onClick={() =>
													openSearch(operation.type)
												}>
												Run
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	);
};

export default WebmasterTool;
