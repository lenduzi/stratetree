export function DemoCallMode() {
    return (
        <div className="demo-call">
            <div className="demo-call-header">
                <button className="btn btn-panic btn-sm">Panic</button>
                <button className="btn btn-secondary btn-sm">Finish Call</button>
            </div>
            <div className="demo-call-section">
                <div className="demo-call-label">Say this now</div>
                <div className="demo-call-title">Clarify</div>
                <div className="demo-call-lines">
                    <div>Totally — let’s make this simple.</div>
                    <div>What would a great outcome look like for you?</div>
                </div>
            </div>
            <div className="demo-call-section demo-call-ask">
                <div className="demo-call-label">Ask next</div>
                <div className="demo-call-lines">
                    <div>What’s the one thing you’re worried they’ll push back on?</div>
                    <div>If they say no, what’s your fallback ask?</div>
                </div>
            </div>
            <div className="demo-call-section">
                <div className="demo-call-label">Next moves</div>
                <div className="demo-call-moves">
                    <button className="demo-move-btn">Positive</button>
                    <button className="demo-move-btn">Neutral</button>
                    <button className="demo-move-btn">Negative</button>
                </div>
            </div>
        </div>
    );
}
