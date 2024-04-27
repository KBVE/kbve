import React, { useState } from 'react';

const WebmasterTool = () => {
	const [url, setUrl] = useState('');

	const handleUrlChange = (event) => {
		setUrl(event.target.value);
	};

	const searchUrls = {
		google: 'https://www.google.com/search?q=site:{url}',
		bing: 'https://www.bing.com/search?q=site:{url}',
		yahoo: 'https://search.yahoo.com/search?p=site:{url}',
		ahrefs: 'https://ahrefs.com/backlink-checker/?input={url}&mode=subdomains',
		// Add more configurations here if needed
	};

	const openSearch = (searchType) => {
		if (!url) {
			alert('Please enter a URL.');
			return;
		}

		const searchUrl = searchUrls[searchType].replace(
			'{url}',
			encodeURIComponent(url),
		);
		window.open(searchUrl, '_blank');
	};

	const operations = [
		{ name: 'Google Search Index', type: 'google' },
		{ name: 'Bing Search Index', type: 'bing' },
		{ name: 'Yahoo Search Index', type: 'yahoo' },
		{ name: 'Ahrefs Backlink Check', type: 'ahrefs' },
		// Add more operations as needed
	];

	return (
		<div className="flex flex-col">
            <div className="p-4">
				<input
					type="text"
					value={url}
					onChange={handleUrlChange}
					placeholder="Enter website URL"
					className="text-sm p-2 border rounded-md w-full"
				/>
			</div>
			<div className="-m-1.5 overflow-x-auto">
				<div className="p-1.5 min-w-full inline-block align-middle">
					<div className="overflow-hidden">
						<table className="!min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
							<thead>
								<tr>
									<th
										scope="col"
										className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
										Operation
									</th>
									<th
										scope="col"
										className="px-6 py-3 text-end text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
										Action
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
								{operations.map((operation) => (
									<tr
										key={operation.type}
										className="hover:!bg-gray-100 dark:hover:!bg-neutral-700 hover:!scale-110">
										<td className="px-6 py-4 whitespace-nowrap text-sm font-medium ">
											{operation.name}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-end text-sm font-medium">
											<button
												type="button"
												className="inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:text-blue-400"
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
