import { describe, expect, it } from 'vitest';
import { StateMachine } from '../stateMachine';

describe('StateMachine', () => {
  it('accepts valid transitions', () => {
    const machine = new StateMachine(['idle', 'thinking', 'acting']);
    expect(machine.state).toBe('idle');
    machine.setState('thinking');
    expect(machine.state).toBe('thinking');
  });

  it('rejects invalid transitions', () => {
    const machine = new StateMachine(['idle', 'thinking']);
    expect(() => machine.setState('acting')).toThrowError();
  });

  it('requires confirmation before acting', () => {
    const machine = new StateMachine(['idle', 'acting']);
    machine.setState('acting');
    machine.setNeedsConfirmation(true);
    expect(machine.canAct()).toBe(false);
    machine.confirm();
    expect(machine.canAct()).toBe(true);
  });
});