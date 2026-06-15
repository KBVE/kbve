import { useEffect, useRef, useState } from 'react';
import {
	FlatList,
	KeyboardAvoidingView,
	Platform,
	StyleSheet,
	TextInput,
	View,
} from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import type { ChatEntry } from '@kbve/core';
import { Screen } from '../ui/primitives/Screen';
import { Text } from '../ui/primitives/Text';
import { Button } from '../ui/primitives/Button';
import { tokens } from '../ui/theme';
import { useKbve } from '../auth/KbveProvider';
import { useChat } from '../chat/useChat';
import { KBVE_CHAT_GAME } from '../config';

function Row({ entry }: { entry: ChatEntry }) {
	const message = entry.message;
	if (message.kind !== 'chat') {
		return (
			<Text variant="caption" tone="faint" style={styles.system}>
				{message.content}
			</Text>
		);
	}
	return (
		<View style={styles.row}>
			<Text variant="caption" tone="primary" weight="medium">
				{message.sender || 'anon'}
			</Text>
			<Text variant="body">{message.content}</Text>
		</View>
	);
}

const renderItem = ({ item }: ListRenderItemInfo<ChatEntry>) => (
	<Row entry={item} />
);
const keyExtractor = (item: ChatEntry) => item.id;

export function ChatScreen() {
	const { chatStore } = useKbve();
	const chat = useChat();
	const [text, setText] = useState('');
	const listRef = useRef<FlatList<ChatEntry>>(null);

	useEffect(() => {
		chatStore.dispatch({
			type: 'connect',
			config: {
				game: KBVE_CHAT_GAME,
				channel: '#general',
				platform: 'mobile',
			},
		});
		return () => chatStore.dispatch({ type: 'close' });
	}, [chatStore]);

	const submit = () => {
		const content = text.trim();
		if (!content) return;
		chatStore.dispatch({ type: 'send', content });
		setText('');
	};

	return (
		<Screen padded={false}>
			<View style={styles.header}>
				<Text variant="subtitle">{chat.channel}</Text>
				<View
					style={[
						styles.dot,
						chat.online ? styles.online : styles.offline,
					]}
				/>
				<Text variant="caption" tone="muted">
					{chat.connection}
				</Text>
			</View>

			<FlatList
				ref={listRef}
				data={chat.entries}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				contentContainerStyle={styles.list}
				onContentSizeChange={() =>
					listRef.current?.scrollToEnd({ animated: true })
				}
			/>

			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
				<View style={styles.inputBar}>
					<TextInput
						style={styles.input}
						placeholder={chat.online ? 'Message…' : 'Connecting…'}
						placeholderTextColor={tokens.color.textFaint}
						value={text}
						onChangeText={setText}
						editable={chat.canSend}
						onSubmitEditing={submit}
						returnKeyType="send"
					/>
					<Button
						title="Send"
						disabled={!chat.canSend || text.trim().length === 0}
						onPress={submit}
					/>
				</View>
			</KeyboardAvoidingView>
		</Screen>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.lg,
		paddingVertical: tokens.space.md,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: tokens.color.border,
	},
	dot: { width: 8, height: 8, borderRadius: tokens.radius.pill },
	online: { backgroundColor: tokens.color.success },
	offline: { backgroundColor: tokens.color.textFaint },
	list: { padding: tokens.space.lg, gap: tokens.space.md },
	row: { gap: 2 },
	system: { textAlign: 'center', fontStyle: 'italic' },
	inputBar: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.lg,
		paddingVertical: tokens.space.md,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: tokens.color.border,
	},
	input: {
		flex: 1,
		backgroundColor: tokens.color.surface,
		color: tokens.color.text,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border,
		paddingHorizontal: tokens.space.lg,
		paddingVertical: tokens.space.sm,
		fontSize: tokens.font.body,
	},
});
