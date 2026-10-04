const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targets = [
  { name: 'Authenticated Map Screen', url: 'http://localhost:4173/?test_session=true', key: 'map' },
  { name: 'Cart State', url: 'http://localhost:4173/?state=cart', key: 'cart' },
  { name: 'Offers State', url: 'http://localhost:4173/?state=offers', key: 'offers' },
];

const results = {};

for (const target of targets) {
  results[target.name] = {
    performance: [],
    accessibility: [],
    bestPractices: [],
    lcp: [],
    fcp: [],
  };

  console.log(`\n=== Running 3 Lighthouse Audits for: ${target.name} ===`);
  for (let run = 1; run <= 3; run++) {
    const reportPath = path.resolve(`lh-${target.key}-run${run}.json`);
    console.log(`Starting Run ${run}/3 for ${target.name}...`);
    try {
      execSync(
        `npx lighthouse "${target.url}" --output=json --output-path="${reportPath}" --chrome-flags="--headless --no-sandbox" --only-categories=performance,accessibility,best-practices --quiet`,
        { stdio: 'inherit' }
      );
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const perf = Math.round((report.categories.performance?.score || 0) * 100);
      const a11y = Math.round((report.categories.accessibility?.score || 0) * 100);
      const bp = Math.round((report.categories['best-practices']?.score || 0) * 100);
      const lcp = report.audits['largest-contentful-paint']?.numericValue || 0;
      const fcp = report.audits['first-contentful-paint']?.numericValue || 0;

      results[target.name].performance.push(perf);
      results[target.name].accessibility.push(a11y);
      results[target.name].bestPractices.push(bp);
      results[target.name].lcp.push(lcp);
      results[target.name].fcp.push(fcp);

      console.log(`Run ${run}: Perf=${perf}, A11y=${a11y}, BP=${bp}, LCP=${(lcp / 1000).toFixed(2)}s`);
    } catch (e) {
      console.error(`Run ${run} failed:`, e.message);
    }
  }
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

console.log('\n======================================================');
console.log('FINAL LIGHTHOUSE 3-RUN SUMMARY TABLE (MEDIANS)');
console.log('======================================================');

for (const [name, data] of Object.entries(results)) {
  console.log(`\nState: ${name}`);
  console.log(`- Performance:     ${median(data.performance)} (Runs: ${data.performance.join(', ')})`);
  console.log(`- Accessibility:   ${median(data.accessibility)} (Runs: ${data.accessibility.join(', ')})`);
  console.log(`- Best Practices:  ${median(data.bestPractices)} (Runs: ${data.bestPractices.join(', ')})`);
  console.log(`- LCP Median:      ${(median(data.lcp) / 1000).toFixed(2)}s`);
  console.log(`- FCP Median:      ${(median(data.fcp) / 1000).toFixed(2)}s`);
}

fs.writeFileSync('lh-summary-medians.json', JSON.stringify(results, null, 2));
