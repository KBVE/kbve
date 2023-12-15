<script lang="ts">
	export let background: string;
</script>

<div class="flex flex-wrap">
	<div class="w-full px-3">
		<div
			class="relative flex flex-col min-w-0 break-words bg-offset shadow-soft-xl rounded-2xl bg-clip-border">
			<div class="flex-auto">
				<div class="flex flex-wrap">
					<div class="rounded-lg shadow w-full">
						<div class="w-full max-w-full px-3">
							<div
								class="border-black/12.5 shadow-soft-xl relative flex h-full min-w-0 flex-col break-words rounded-2xl border-0 border-solid bg-offset bg-clip-border p-2">
								<div
									class="relative h-full overflow-hidden bg-cover rounded-xl"
									style="background-image: url('{background}')">
									<span
										class="absolute top-0 left-0 w-full h-full bg-center bg-cover bg-gradient-to-tl from-gray-900 to-slate-800 opacity-80" />
									<div
										class="relative z-10 flex flex-col flex-auto h-full p-4">
										<slot />
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
