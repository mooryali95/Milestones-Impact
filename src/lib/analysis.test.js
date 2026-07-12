import { analyzeBookings, PATTERNS, RECOMMENDATIONS_TABLE } from './analysis';

// Minimal proc factory matching the shape App builds from TRACKS × PHASES.
const proc = (trackId, phaseId, extra = {}) => ({
  key: `${trackId}-${phaseId}`,
  trackId,
  phaseId,
  nameAr: `${trackId} ${phaseId}`,
  trackNameAr: trackId,
  trackColor: '#000',
  trackIcon: '◆',
  phaseNameAr: `مرحلة ${phaseId}`,
  fedBy: [],
  ...extra,
});

const datesFor = (procs, start = '2026-08-01') =>
  procs.reduce((acc, p, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    acc[p.key] = d.toISOString().slice(0, 10);
    return acc;
  }, {});

describe('analyzeBookings', () => {
  test('returns null with fewer than 3 bookings', () => {
    const procs = [proc('creation', 1), proc('creation', 2)];
    expect(analyzeBookings(procs, datesFor(procs), {})).toBeNull();
  });

  test('detects a sequential pattern within one track', () => {
    const procs = [proc('creation', 1), proc('creation', 2), proc('creation', 3)];
    const r = analyzeBookings(procs, datesFor(procs), {});
    expect(r.patternId).toBe('sequential');
    expect(r.pattern).toBe(PATTERNS.sequential);
    expect(r.totalBooked).toBe(3);
  });

  test('flags dependency gaps for unbooked feeders', () => {
    const feeder = proc('creation', 1); // exists in the matrix but stays unbooked
    const booked = [
      proc('establishment', 1, { fedBy: ['creation-1'] }),
      proc('establishment', 2),
      proc('making', 1),
    ];
    const procs = [feeder, ...booked];
    // only the three `booked` procs get dates; the feeder is intentionally left out
    const r = analyzeBookings(procs, datesFor(booked), {});
    expect(r.depGaps).toHaveLength(1);
    expect(r.depGaps[0].missingKey).toBe('creation-1');
    // a dep gap must surface the corresponding recommendation
    expect(r.recommendations).toContain(
      RECOMMENDATIONS_TABLE.find(x => x.id === 'has_dep_gaps').text
    );
  });

  test('reports complete readiness at full 4×4 coverage', () => {
    const procs = [];
    for (const t of ['creation', 'innovation', 'establishment', 'making'])
      for (let ph = 1; ph <= 4; ph++) procs.push(proc(t, ph));
    const r = analyzeBookings(procs, datesFor(procs), {});
    expect(r.trackCoverage.covered).toBe(4);
    expect(r.phaseCoverage.covered).toBe(4);
    expect(r.readiness).toBe('complete');
    expect(r.weightBalance.pct).toBe(100);
    expect(r.isComplete).toBe(true);
  });
});
