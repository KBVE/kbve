/* Links against the staticlib the way UnrealBuildTool will: Apple/host
 * toolchain, C header only, no cargo in the loop. Guards the case where the
 * Rust toolchain's LLVM drifts past what the platform linker can read. */
#include "unr.h"
#include <stdio.h>
#include <string.h>

int main(void) {
	if (unr_add(2, 40) != 42) {
		fprintf(stderr, "unr_add wrong\n");
		return 1;
	}
	if (unr_runtime_probe(10) != 45) {
		fprintf(stderr, "unr_runtime_probe wrong (tokio runtime failed?)\n");
		return 1;
	}
	if (strlen(unr_version()) == 0) {
		fprintf(stderr, "unr_version empty\n");
		return 1;
	}
	printf("link probe ok: version=%s add=42 probe=45\n", unr_version());
	return 0;
}
