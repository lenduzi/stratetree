import { DemoCard } from './DemoCard';
import { DemoCapture } from './demos/DemoCapture';
import { DemoStructuring } from './demos/DemoStructuring';
import { DemoCallMode } from './demos/DemoCallMode';

export function DemoSection() {
    return (
        <section className="landing-demo">
            <div className="demo-header">
                <h2>See it in action</h2>
            </div>
            <div className="demo-grid">
                <DemoCard step="Step 1" title="Tell YapMap what’s up (text or voice)" subtitle="Dump your thoughts. Tap to yap.">
                    <DemoCapture />
                </DemoCard>
                <DemoCard step="Step 2" title="Yappi builds your game plan" subtitle="Goal, likely responses, best lines.">
                    <DemoStructuring />
                </DemoCard>
                <DemoCard step="Step 3" title="Get live coaching in the conversation" subtitle="Stay calm — pick the next move.">
                    <DemoCallMode />
                </DemoCard>
            </div>
            <div className="demo-note">No signup needed to try.</div>
        </section>
    );
}
