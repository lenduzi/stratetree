import { ReactNode } from 'react';

type DemoCardProps = {
    step: string;
    title: string;
    subtitle: string;
    children: ReactNode;
};

export function DemoCard({ step, title, subtitle, children }: DemoCardProps) {
    return (
        <div className="demo-card">
            <div className="demo-card-header">
                <span className="demo-step-label">{step}</span>
                <h3>{title}</h3>
                <p>{subtitle}</p>
            </div>
            <div className="demo-card-body">
                <div className="demo-preview">{children}</div>
            </div>
        </div>
    );
}
