import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { error?: Error; stack?: string };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ stack: info.componentStack ?? undefined });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <pre
        style={{
          padding: "1rem",
          whiteSpace: "pre-wrap",
          fontFamily: "ui-monospace, monospace",
          fontSize: "0.8rem",
        }}
      >
        {this.state.error.message}
        {"\n\n"}
        {this.state.error.stack}
        {"\n\n"}
        {this.state.stack}
      </pre>
    );
  }
}
