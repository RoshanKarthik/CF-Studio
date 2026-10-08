import { Flag, Hourglass } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ContestInfo } from '../core/contest';
import { contestClock, formatCountdown } from '../core/contest';

/** Contest mode: time left in the contest (or until it starts), next to the timer. */
export function ContestClock({ info }: { info: ContestInfo }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = contestClock(info, now);
  if (clock.kind === 'finished') return null;
  const title = info.name || 'Contest';
  if (clock.kind === 'running') {
    const tone = clock.seconds <= 600 ? 'warn' : '';
    return (
      <span className={`contest-clock ${tone}`} title={`${title} — time left`}>
        <Hourglass size={13} /> {formatCountdown(clock.seconds)} left
      </span>
    );
  }
  return (
    <span className="contest-clock muted-clock" title={title}>
      <Flag size={13} />
      {clock.kind === 'before' ? `Starts in ${formatCountdown(clock.seconds)}` : clock.kind === 'testing' ? 'System testing' : 'Contest over'}
    </span>
  );
}
