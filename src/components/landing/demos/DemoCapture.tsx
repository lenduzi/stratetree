export function DemoCapture() {
    return (
        <div className="demo-capture">
            <div className="capture-body">
                <div className="capture-textarea-wrap">
                    <label className="sr-only" htmlFor="demo-capture-textarea">
                        Describe the situation
                    </label>
                    <textarea
                        id="demo-capture-textarea"
                        className="capture-textarea"
                        placeholder="Describe the situation"
                        rows={4}
                        readOnly
                    />
                    <button type="button" className="capture-mic-inline demo-mic demo-mic-strong" aria-label="Demo mic">
                        🎤
                    </button>
                </div>
                <button className="btn btn-primary btn-lg capture-cta" disabled>
                    Create game plan
                </button>
            </div>
        </div>
    );
}
