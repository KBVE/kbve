import { Check, Loader2 } from 'lucide-react';

export interface ChecklistStep {
	label: string;
	done: boolean;
}

export function LoginChecklist({ steps }: { steps: ChecklistStep[] }) {
	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 9999,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'rgba(10,10,12,0.72)',
				backdropFilter: 'blur(6px)',
			}}>
			<div
				style={{
					minWidth: 280,
					padding: '24px 28px',
					borderRadius: 16,
					background: '#16161a',
					border: '1px solid rgba(255,255,255,0.08)',
					fontFamily: 'system-ui, sans-serif',
					color: '#f4f4f5',
				}}>
				<div
					style={{
						fontSize: 15,
						fontWeight: 700,
						marginBottom: 18,
					}}>
					Signing you in…
				</div>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 12,
					}}>
					{steps.map((s) => (
						<div
							key={s.label}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 12,
							}}>
							<span
								style={{
									width: 22,
									height: 22,
									borderRadius: 6,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									flexShrink: 0,
									background: s.done
										? '#22c55e'
										: 'transparent',
									border: s.done
										? '1px solid #22c55e'
										: '1px solid rgba(255,255,255,0.2)',
								}}>
								{s.done ? (
									<Check size={14} color="#fff" />
								) : (
									<Loader2
										size={14}
										color="rgba(255,255,255,0.55)"
										style={{
											animation:
												'spin 0.9s linear infinite',
										}}
									/>
								)}
							</span>
							<span
								style={{
									fontSize: 14,
									opacity: s.done ? 1 : 0.65,
								}}>
								{s.label}
							</span>
						</div>
					))}
				</div>
			</div>
			<style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
		</div>
	);
}
