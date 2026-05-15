import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { colorForLanguage, type LocEntry } from './nxReportParse';

interface Props {
	entries: LocEntry[];
	height?: number;
}

export default function ReactNxReport({ entries, height = 420 }: Props) {
	const top = entries.slice(0, 15);
	return (
		<ResponsiveContainer width="100%" height={height}>
			<BarChart
				data={top}
				layout="vertical"
				margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
				<CartesianGrid stroke="rgba(148,163,184,0.08)" />
				<XAxis
					type="number"
					stroke="#64748b"
					tick={{ fontSize: 11, fill: '#94a3b8' }}
				/>
				<YAxis
					dataKey="language"
					type="category"
					width={140}
					stroke="#64748b"
					tick={{ fontSize: 11, fill: '#cbd5e1' }}
				/>
				<Tooltip
					cursor={{ fill: 'rgba(148,163,184,0.05)' }}
					contentStyle={{
						background: '#0f172a',
						border: '1px solid rgba(148,163,184,0.2)',
						borderRadius: 6,
						color: '#e2e8f0',
					}}
					formatter={(v: number) => v.toLocaleString()}
				/>
				<Bar dataKey="code" name="Lines of code" radius={[0, 4, 4, 0]}>
					{top.map((e) => (
						<Cell
							key={e.language}
							fill={colorForLanguage(e.language)}
						/>
					))}
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}
