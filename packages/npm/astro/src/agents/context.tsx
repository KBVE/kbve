import { createContext, useContext, type ReactNode } from 'react';
import { createAgents, type AgentsApi, type AgentsConfig } from '@kbve/droid';

let _agents: AgentsApi | null = null;

export function registerAgents(api: AgentsApi): AgentsApi {
	_agents = api;
	return api;
}

export function configureAgents(config: AgentsConfig): AgentsApi {
	if (_agents) return _agents;
	_agents = createAgents(config);
	return _agents;
}

export function getAgents(): AgentsApi {
	if (!_agents) {
		throw new Error(
			'@kbve/astro agents: no instance registered. Call configureAgents() / registerAgents() at app boot.',
		);
	}
	return _agents;
}

export function peekAgents(): AgentsApi | null {
	return _agents;
}

const AgentsContext = createContext<AgentsApi | null>(null);

export function AgentsProvider({
	value,
	children,
}: {
	value: AgentsApi;
	children: ReactNode;
}) {
	registerAgents(value);
	return (
		<AgentsContext.Provider value={value}>
			{children}
		</AgentsContext.Provider>
	);
}

export function useAgents(): AgentsApi {
	const ctx = useContext(AgentsContext);
	return ctx ?? getAgents();
}
