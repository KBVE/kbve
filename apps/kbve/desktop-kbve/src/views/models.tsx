import { ViewTabs } from '../components/ViewTabs';
import { ModelEcosystemPanel } from '../components/settings/models/ModelEcosystemPanel';

export function ModelsView() {
	return (
		<div className="view-column">
			<ViewTabs
				tabs={[
					{
						id: 'llm',
						label: 'LLM',
						content: <ModelEcosystemPanel sections={['llm']} />,
					},
					{
						id: 'tts',
						label: 'TTS',
						content: <ModelEcosystemPanel sections={['tts']} />,
					},
					{
						id: 'stt',
						label: 'STT',
						content: <ModelEcosystemPanel sections={['stt']} />,
					},
				]}
			/>
		</div>
	);
}
