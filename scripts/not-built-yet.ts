// Honest notice for workspace packages whose milestone has not been built yet.
// Exits 0 so root scripts can run, but never claims to have done any work.
const name = process.argv[2] ?? 'This package';
console.log(
  `${name}: not built yet. It is scheduled for a later milestone (see docs/STATUS.txt). Nothing was run.`,
);
