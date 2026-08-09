float bayer4(vec2 frag) {
	int x = int(mod(frag.x, 4.0));
	int y = int(mod(frag.y, 4.0));

	int index = x + y * 4;

	int matrix[16] = int[](
		0,  8,  2, 10,
		12,  4, 14,  6,
		3, 11,  1,  9,
		15,  7, 13,  5
	);

	return float(matrix[index]) / 16.0;
}

float bayer8(vec2 frag) {
	int x = int(mod(frag.x, 8.0));
	int y = int(mod(frag.y, 8.0));

	int index = x + y * 8;

	int matrix[64] = int[](
		0, 32,  8, 40,  2, 34, 10, 42,
		48, 16, 56, 24, 50, 18, 58, 26,
		12, 44,  4, 36, 14, 46,  6, 38,
		60, 28, 52, 20, 62, 30, 54, 22,
		3, 35, 11, 43,  1, 33,  9, 41,
		51, 19, 59, 27, 49, 17, 57, 25,
		15, 47,  7, 39, 13, 45,  5, 37,
		63, 31, 55, 23, 61, 29, 53, 21
	);
	return float(matrix[index]) / 64.0;
}