import type { InputErrorFactory, IntegrationRegistration } from './backend.js';
import { backendFactories } from './generated/backend.js';

/** Explicit built-in wiring; host applications only consume the resulting catalog. */
export function createCodeRegistrations(
  inputError: InputErrorFactory,
): ReadonlyMap<string, IntegrationRegistration> {
  const registrations = new Map<string, IntegrationRegistration>();
  for (const { type, definition, create } of backendFactories) {
    const registration = create(inputError);
    if (
      registration.type !== type ||
      registration.definition !== definition ||
      registrations.has(type)
    )
      throw new Error(`Invalid backend integration registration: ${type}`);
    registrations.set(type, registration);
  }
  return registrations;
}
