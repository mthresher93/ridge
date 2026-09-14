"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="cd-page">
        <header className="crm-desk-head">
          <div>
            <h1>Something broke</h1>
            <p>The screen crashed. Reload to keep working from the last saved workspace.</p>
          </div>
        </header>
        <p className="rec-warn">{this.state.error.message}</p>
        <button className="az-btn pri" type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
