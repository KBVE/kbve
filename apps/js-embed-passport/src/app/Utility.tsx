import React from 'react';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import tw from 'twin.macro';

const Utility = () => {
	return (
		<div tw="flex flex-col m-8 rounded shadow-md w-60 sm:w-80 animate-pulse h-96">
			<div tw="h-48 rounded-t bg-gray-700"></div>
			<div tw="flex-1 px-4 py-8 space-y-4 sm:p-8 bg-gray-900">
				<div tw="w-full h-6 rounded bg-gray-700"></div>
				<div tw="w-full h-6 rounded bg-gray-700"></div>
				<div tw="w-3/4 h-6 rounded bg-gray-700"></div>
			</div>
		</div>
	);
};

export default Utility;
