export class StateMachine {
  private allowedStates: Set<string>;
  private confirmed = false;
  private needsConfirmation = false;
  private stateMap: Record<string, string>;
  state: string;

  constructor(states: string[], initialState?: string, stateMap: Record<string, string> = {}) {
    if (states.length === 0) {
      throw new Error('StateMachine requires at least one state');
    }
    this.allowedStates = new Set(states);
    this.stateMap = stateMap;
    const fallback = initialState ?? states[0];
    if (!this.allowedStates.has(fallback)) {
      throw new Error(`Invalid initial state: ${fallback}`);
    }
    this.state = fallback;
  }

  setState(next: string) {
    const resolved = this.resolveState(next);
    if (!this.allowedStates.has(resolved)) {
      throw new Error(`Invalid state: ${next}`);
    }
    this.state = resolved;
    if (next !== 'acting') {
      this.confirmed = false;
      this.needsConfirmation = false;
    }
  }

  resolveState(next: string): string {
    return this.stateMap[next] ?? next;
  }

  setNeedsConfirmation(flag: boolean) {
    this.needsConfirmation = flag;
    if (!flag) {
      this.confirmed = false;
    }
  }

  confirm() {
    if (this.needsConfirmation) {
      this.confirmed = true;
    }
  }

  canAct(): boolean {
    if (this.state !== 'acting') {
      return true;
    }
    if (!this.needsConfirmation) {
      return true;
    }
    return this.confirmed;
  }
}