import { Component, ReactNode } from 'react';

type ErrorBoundaryProps = {
    children: ReactNode;
    title?: string;
    onRetry?: () => void;
};

type ErrorBoundaryState = {
    hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: unknown) {
        console.error('[ErrorBoundary]', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="card" style={{ padding: 'var(--space-lg)', textAlign: 'center' }}>
                    <h2 className="modal-title">{this.props.title || 'Something went wrong'}</h2>
                    <p className="text-muted">We hit a snag rendering this view.</p>
                    {this.props.onRetry && (
                        <button className="btn btn-primary" onClick={this.props.onRetry}>
                            Retry generation
                        </button>
                    )}
                </div>
            );
        }
        return this.props.children;
    }
}
