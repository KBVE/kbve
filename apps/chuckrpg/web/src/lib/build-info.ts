declare const __CHUCK_BUILD_INFO__: {
	version: string | null;
	commit: string | null;
	commitUrl: string | null;
	builtAt: string;
};

export const buildInfo = __CHUCK_BUILD_INFO__;
