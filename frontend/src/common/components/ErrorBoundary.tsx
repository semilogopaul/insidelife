'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isStaleBuildError, recoverFromStaleBuild } from '../pwa/update-check';

interface Props {
  readonly fallback: (reset: () => void) => ReactNode;
  readonly children: ReactNode;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  readonly failed: boolean;
}

/**
 * React only supports error boundaries as class components (there is no hook equivalent), so this is the one
 * justified exception to the functional-components rule.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // A panel's code from an older build after an update: refresh into the new build rather than show the fallback.
    if (isStaleBuildError(error)) void recoverFromStaleBuild();
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => this.setState({ failed: false });

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}
