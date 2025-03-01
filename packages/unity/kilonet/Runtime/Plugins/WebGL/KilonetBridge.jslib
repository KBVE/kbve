if (typeof BridgeLibrary === 'undefined') {
const BridgeLibrary = {
	InitializeIFrameBridge: function () {
		window.addEventListener('message', BridgeLibrary._IFrameBridge);
	},
	_SendUnityMessage: function (methodName, data) {
		if (!methodName) {
			console.error('Method name is required for SendUnityMessage.');
			return;
		}
		const payload = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : '{}';
		unityInstance.SendMessage('DiscordBridge', methodName, payload);
	},
	_IFrameBridge: function ({ data: messageData }) {
		try {
			if (!messageData || !messageData.command) {
				throw new Error('Invalid message received.');
			}
			switch (messageData.command) {
				case 'DISPATCH':
					BridgeLibrary._handleDispatch(messageData);
					break;
				case 'GET_CHANNEL_ID':
				case 'GET_GUILD_ID':
				case 'GET_USER_ID':
				case 'GET_INSTANCE_ID':
					BridgeLibrary._handleGetRequests(messageData);
					break;
				case 'GET_USER':
				case 'SET_ACTIVITY':
				case 'HARDWARE_ACCELERATION':
					BridgeLibrary._SendUnityMessage(
						`Receive${messageData.command.replace('GET_', '')}`,
						messageData.data,
					);
					break;
				default:
					console.warn(`Unhandled command: ${messageData.command}`);
			}
		} catch (error) {
			console.error('Error processing message:', error);
		}
	},
	_handleDispatch: function (messageData) {
		if (!messageData.event) {
			console.error('Event not set in DISPATCH command.');
			return;
		}
		const methodName = `Receive${messageData.event}`;
		BridgeLibrary._SendUnityMessage(methodName, messageData.data);
	},
	_handleGetRequests: function (messageData) {
		const commandToMethodMap = {
			GET_USER_ID: 'ReceiveUserId',
			GET_INSTANCE_ID: 'ReceiveSDKInstanceId',
			GET_GUILD_ID: 'ReceiveGuildId',
			GET_CHANNEL_ID: 'ReceiveChannelId',
		};
		const methodName = commandToMethodMap[messageData.command];
		if (methodName) {
			BridgeLibrary._SendUnityMessage(methodName, messageData.data);
		} else {
			console.warn(`Unknown GET command: ${messageData.command}`);
		}
	},
	Subscribe: function (event) {
		event = UTF8ToString(event);
		const args = [
			'VOICE_STATE_UPDATE',
			'SPEAKING_START',
			'SPEAKING_STOP',
		].includes(event)
			? { channel_id: true }
			: undefined;
		window.parent.postMessage({ command: 'SUBSCRIBE', event, args });
	},
	Unsubscribe: function (event) {
		event = UTF8ToString(event);
		const args = [
			'VOICE_STATE_UPDATE',
			'SPEAKING_START',
			'SPEAKING_STOP',
		].includes(event)
			? { channel_id: true }
			: undefined;
		window.parent.postMessage({ command: 'UNSUBSCRIBE', event, args });
	},

	RequestSetActivity: function (stringifiedActivity) {
		const activity = JSON.parse(UTF8ToString(stringifiedActivity));
		window.parent.postMessage({
			command: 'SET_ACTIVITY',
			args: { activity },
		});
	},
	RequestInstanceId: function () {
		window.parent.postMessage({ command: 'GET_INSTANCE_ID' });
	},
	RequestChannelId: function () {
		window.parent.postMessage({ command: 'GET_CHANNEL_ID' });
	},
	RequestGuildId: function () {
		window.parent.postMessage({ command: 'GET_GUILD_ID' });
	},
	RequestUserId: function () {
		window.parent.postMessage({ command: 'GET_USER_ID' });
	},
	RequestUser: function () {
		window.parent.postMessage({ command: 'GET_USER' });
	},
	RequestInstanceParticipants: function () {
		window.parent.postMessage({ command: 'GET_INSTANCE_PARTICIPANTS' });
	},
	RequestHardwareAcceleration: function () {
		window.parent.postMessage({ command: 'HARDWARE_ACCELERATION' });
	},
	RequestChannel: function (channelId) {
		channelId = UTF8ToString(channelId);
		window.parent.postMessage({
			command: 'GET_CHANNEL',
			args: { channel_id: channelId },
		});
	},
	RequestChannelPermissions: function (channelId) {
		channelId = UTF8ToString(channelId);
		window.parent.postMessage({
			command: 'GET_CHANNEL_PERMISSIONS',
			args: { channel_id: channelId },
		});
	},
	RequestEntitlements: function () {
		window.parent.postMessage({ command: 'GET_ENTITLEMENTS' });
	},
	RequestPlatformBehaviors: function () {
		window.parent.postMessage({ command: 'GET_PLATFORM_BEHAVIORS' });
	},
	RequestSkus: function () {
		window.parent.postMessage({ command: 'GET_SKUS' });
	},
	RequestImageUpload: function () {
		window.parent.postMessage({ command: 'IMAGE_UPLOAD' });
	},
	RequestOpenExternalLink: function (url) {
		url = UTF8ToString(url);
		window.parent.postMessage({
			command: 'EXTERNAL_LINK',
			args: { url },
		});
	},
	RequestInviteDialog: function () {
		window.parent.postMessage({ command: 'INVITE_DIALOG' });
	},
	RequestShareMomentDialog: function (mediaUrl) {
		mediaUrl = UTF8ToString(mediaUrl);
		window.parent.postMessage({
			command: 'SHARE_MOMENT_DIALOG',
			args: { mediaUrl },
		});
	},
	RequestSetOrientationLockState: function (
		lockState,
		pictureInPictureLockState,
		gridLockState,
	) {
		const picture_in_picture_lock_state = pictureInPictureLockState
			? UTF8ToString(pictureInPictureLockState)
			: undefined;
		const grid_lock_state = gridLockState
			? UTF8ToString(gridLockState)
			: undefined;
		window.parent.postMessage({
			command: 'SET_ORIENTATION_LOCK_STATE',
			args: {
				lock_state: lockState,
				picture_in_picture_lock_state,
				grid_lock_state,
			},
		});
	},
	RequestPurchase: function () {
		window.parent.postMessage({ command: 'START_PURCHASE' });
	},
	RequestLocale: function () {
		window.parent.postMessage({ command: 'GET_LOCALE' });
	},
	RequestSetConfig: function (useInteractivePip) {
		const use_interactive_pip = UTF8ToString(useInteractivePip) === 'True';
		window.parent.postMessage({
			command: 'SET_CONFIG',
			args: { use_interactive_pip },
		});
	},
	PingLoad: function () {
		window.parent.postMessage({ command: 'PING_LOAD' });
	},
};

mergeInto(LibraryManager.library, BridgeLibrary);
console.log("KilonetBridge.jslib is loaded.");
}