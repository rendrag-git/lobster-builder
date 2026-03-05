import type { ActionDefinition, ActionCategory } from '../types/actions';

const actions = new Map<string, ActionDefinition>();

export function registerAction(action: ActionDefinition) {
  actions.set(action.id, action);
}

export function getAction(id: string): ActionDefinition | undefined {
  return actions.get(id);
}

export function getAllActions(): ActionDefinition[] {
  return Array.from(actions.values());
}

export function getActionsByCategory(category: ActionCategory): ActionDefinition[] {
  return Array.from(actions.values()).filter((a) => a.category === category);
}
