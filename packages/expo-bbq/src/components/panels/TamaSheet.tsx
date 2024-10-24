import React, { useImperativeHandle, forwardRef, useState } from 'react';
import { Sheet, Button, YStack, Separator, SizableText } from 'tamagui';

interface SheetComponentProps {
	title?: string;
	priority?: number;
	children?: React.ReactNode;
}

export const SheetComponent = forwardRef(
	({ title, priority = 0, children }: SheetComponentProps, ref) => {
		const [open, setOpen] = useState(false);

		useImperativeHandle(ref, () => ({
			showSheet: () => {
				setOpen(true);
			},
			hideSheet: () => {
				setOpen(false);
			},
		}));

		return (
			<Sheet
				modal={true}
				open={open}
				onOpenChange={setOpen}
				snapPoints={[80]}
				dismissOnOverlayPress={true}
                dismissOnSnapToBottom
                animation="medium">
				<Sheet.Overlay
					animation="lazy"
					enterStyle={{ opacity: 0 }}
					exitStyle={{ opacity: 0 }}
				/>
				<Sheet.Handle />
				<Sheet.Frame
					padding="$4"
					justifyContent="center"
					alignItems="center"
					gap="$5">
					<YStack
						justifyContent="center"
						alignItems="center"
						gap="$3">
						{/* Icon and Title */}
						{title && <SizableText size="$5">{title}</SizableText>}

						<Separator marginVertical="$4" />

						{children}

						<Button onPress={() => setOpen(false)}>Close</Button>
					</YStack>
				</Sheet.Frame>
			</Sheet>
		);
	},
);
