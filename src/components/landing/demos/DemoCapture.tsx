export function DemoCapture() {
    return (
        <div className="demo-capture">
            <div className="capture-body">
                <button type="button" className="capture-mic demo-mic" aria-label="Demo mic">
                    🎤
                </button>
                <div className="capture-label">Tap to yap</div>
                <textarea
                    className="capture-textarea"
                    placeholder="Dump your thoughts. What’s the situation?"
                    rows={4}
                    readOnly
                />
                <button className="btn btn-primary btn-lg capture-cta" disabled>
                    Create my YapMap
                </button>
            </div>
        </div>
    );
}
