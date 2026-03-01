import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Flag } from 'lucide-react';
import { addToast } from '@kbve/astro';
import { reportMeme, REPORT_REASONS } from '../../lib/memeService';

interface ReportModalProps {
	memeId: string;
	onClose: () => void;
}

export default function ReportModal({ memeId, onClose }: ReportModalProps) {
	const [reason, setReason] = useState<number | null>(null);
	const [detail, setDetail] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);

	// Escape key
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [onClose]);

	// Lock body scroll
	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, []);

	const handleSubmit = useCallback(async () => {
		if (reason === null || submitting) return;
		setSubmitting(true);
		try {
			const result = await reportMeme(
				memeId,
				reason,
				detail.trim() || undefined,
			);
			if (result.alreadyReported) {
				addToast({
					id: `report-dup-${Date.now()}`,
					message: 'You have already reported this meme.',
					severity: 'info',
					duration: 4000,
				});
			} else {
				addToast({
					id: `report-ok-${Date.now()}`,
					message: 'Report submitted. Thank you.',
					severity: 'success',
					duration: 4000,
				});
			}
			setSubmitted(true);
			setTimeout(onClose, 1500);
		} catch {
			addToast({
				id: `report-err-${Date.now()}`,
				message: 'Failed to submit report.',
				severity: 'error',
				duration: 4000,
			});
		} finally {
			setSubmitting(false);
		}
	}, [reason, detail, submitting, memeId, onClose]);

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
			role="dialog"
			aria-modal="true"
			aria-label="Report meme"
			onClick={(e) => {
				if (e.target === e.currentTarget && !submitting) onClose();
			}}>
			<div
				className="w-full max-w-sm rounded-xl shadow-2xl p-5"
				style={{
					backgroundColor: 'var(--sl-color-bg-nav, #18181b)',
					color: 'var(--sl-color-white, #e2e8f0)',
				}}>
				{/* Header */}
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-base font-semibold flex items-center gap-2">
						<Flag size={16} /> Report Meme
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="w-8 h-8 flex items-center justify-center rounded-md"
						style={{
							color: 'var(--sl-color-gray-3, #71717a)',
						}}>
						<X size={16} />
					</button>
				</div>

				{submitted ? (
					<p
						className="text-sm text-center py-4"
						style={{
							color: 'var(--sl-color-gray-2, #a1a1aa)',
						}}>
						Thank you for your report.
					</p>
				) : (
					<>
						{/* Reason selection */}
						<fieldset className="flex flex-col gap-2 mb-4">
							<legend
								className="text-xs font-medium mb-2"
								style={{
									color: 'var(--sl-color-gray-2, #a1a1aa)',
								}}>
								Why are you reporting this meme?
							</legend>
							{REPORT_REASONS.map((r) => (
								<label
									key={r.key}
									className="flex items-center gap-2 cursor-pointer text-sm">
									<input
										type="radio"
										name="report-reason"
										checked={reason === r.key}
										onChange={() => setReason(r.key)}
										className="accent-[var(--sl-color-accent,#0ea5e9)]"
									/>
									<span
										style={{
											color:
												reason === r.key
													? 'var(--sl-color-white, #e2e8f0)'
													: 'var(--sl-color-gray-2, #a1a1aa)',
										}}>
										{r.label}
									</span>
								</label>
							))}
						</fieldset>

						{/* Detail textarea */}
						<textarea
							value={detail}
							onChange={(e) =>
								setDetail(e.target.value.slice(0, 2000))
							}
							placeholder="Additional details (optional)"
							rows={3}
							className="w-full resize-none rounded-lg px-3 py-2 text-sm mb-4 outline-none"
							style={{
								backgroundColor:
									'var(--sl-color-gray-6, #1c1c1e)',
								color: 'var(--sl-color-white, #e2e8f0)',
								border: '1px solid var(--sl-color-hairline, #27272a)',
							}}
						/>

						<div className="flex justify-end">
							<button
								type="button"
								onClick={handleSubmit}
								disabled={reason === null || submitting}
								className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
								style={{
									backgroundColor: '#ef4444',
									color: '#fff',
								}}>
								{submitting
									? 'Submitting...'
									: 'Submit Report'}
							</button>
						</div>
					</>
				)}
			</div>
		</div>,
		document.body,
	);
}
