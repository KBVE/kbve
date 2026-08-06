import { Component } from 'react';
import type { ReactNode } from 'react';
import { Stack, Surface, Text } from './_ui';

interface DashErrorBoundaryProps {
	label?: string;
	children: ReactNode;
}

interface DashErrorBoundaryState {
	error: Error | null;
}

export class DashErrorBoundary extends Component<
	DashErrorBoundaryProps,
	DashErrorBoundaryState
> {
	override state: DashErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): DashErrorBoundaryState {
		return { error };
	}

	override componentDidCatch(error: Error, info: { componentStack?: string | null }) {
		console.error(
			`[dash${this.props.label ? `:${this.props.label}` : ''}] render crashed`,
			error,
			info.componentStack ?? '',
		);
	}

	override render() {
		const { error } = this.state;
		if (error) {
			return (
				<Surface>
					<Stack gap="xs">
						<Text variant="label" tone="danger">
							Dashboard crashed while rendering
						</Text>
						<Text variant="caption" tone="muted">
							{error.name && error.name !== 'Error'
								? `${error.name}: ${error.message}`
								: error.message}
						</Text>
						<Text variant="caption" tone="faint">
							Full stack in the browser console.
						</Text>
					</Stack>
				</Surface>
			);
		}
		return this.props.children;
	}
}
