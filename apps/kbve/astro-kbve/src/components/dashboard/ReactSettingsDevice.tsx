/**
 * @deprecated Cleaned up 2026-07 — /dashboard/account now renders the unified
 * RN AccountScreen from @kbve/rn (web + mobile, one component). This legacy
 * account surface is no longer mounted anywhere. Do not extend it; port any
 * remaining pieces (wallet / market / referral) into @kbve/rn, then delete.
 */
import { useState, useEffect } from 'react';
import {
	Cpu,
	Wifi,
	Battery,
	Monitor,
	Smartphone,
	Globe,
	MemoryStick,
} from 'lucide-react';
import {
	infoGridStyle,
	infoRowStyle,
	infoLabelStyle,
	infoValueStyle,
} from './settingsStyles';

interface DeviceInfo {
	label: string;
	value: string;
	icon: React.ReactNode;
}

export default function ReactSettingsDevice() {
	const [infos, setInfos] = useState<DeviceInfo[]>([]);
	const [batteryInfo, setBatteryInfo] = useState<string | null>(null);

	useEffect(() => {
		const items: DeviceInfo[] = [];

		items.push({
			label: 'Browser',
			value:
				navigator.userAgent.split(/[()]/)[1] ||
				navigator.userAgent.slice(0, 60),
			icon: <Globe size={16} />,
		});

		items.push({
			label: 'Platform',
			value: navigator.platform || 'Unknown',
			icon: <Monitor size={16} />,
		});

		items.push({
			label: 'Language',
			value: navigator.language,
			icon: <Globe size={16} />,
		});

		items.push({
			label: 'Logical Cores',
			value: navigator.hardwareConcurrency
				? String(navigator.hardwareConcurrency)
				: 'Unknown',
			icon: <Cpu size={16} />,
		});

		items.push({
			label: 'Device Memory',
			value: (navigator as any).deviceMemory
				? `${(navigator as any).deviceMemory} GB`
				: 'Unknown',
			icon: <MemoryStick size={16} />,
		});

		items.push({
			label: 'Screen',
			value: `${screen.width}x${screen.height} @ ${window.devicePixelRatio}x`,
			icon: <Monitor size={16} />,
		});

		items.push({
			label: 'Connection',
			value: (navigator as any).connection?.effectiveType || 'Unknown',
			icon: <Wifi size={16} />,
		});

		items.push({
			label: 'Online',
			value: navigator.onLine ? 'Yes' : 'No',
			icon: <Wifi size={16} />,
		});

		items.push({
			label: 'Touch',
			value:
				navigator.maxTouchPoints > 0
					? `${navigator.maxTouchPoints} points`
					: 'No',
			icon: <Smartphone size={16} />,
		});

		items.push({
			label: 'Color Scheme',
			value: window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'Dark'
				: 'Light',
			icon: <Monitor size={16} />,
		});

		setInfos(items);

		if ('getBattery' in navigator) {
			(navigator as any)
				.getBattery()
				.then((batt: any) => {
					const level = Math.round(batt.level * 100);
					const charging = batt.charging ? ', Charging' : '';
					setBatteryInfo(`${level}%${charging}`);
				})
				.catch(() => {
					setBatteryInfo('Not available');
				});
		} else {
			setBatteryInfo('API not supported');
		}
	}, []);

	return (
		<div style={infoGridStyle}>
			{infos.map((info) => (
				<div key={info.label} style={infoRowStyle}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '0.5rem',
							color: 'var(--sl-color-gray-3)',
						}}>
						{info.icon}
						<span style={infoLabelStyle}>{info.label}</span>
					</div>
					<span style={infoValueStyle}>{info.value}</span>
				</div>
			))}
			{batteryInfo && (
				<div style={infoRowStyle}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '0.5rem',
							color: 'var(--sl-color-gray-3)',
						}}>
						<Battery size={16} />
						<span style={infoLabelStyle}>Battery</span>
					</div>
					<span style={infoValueStyle}>{batteryInfo}</span>
				</div>
			)}
		</div>
	);
}
