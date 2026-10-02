# komarovmassage-monitoring

Lighthouse CI monitoring for https://komarovmassage.lv

## What is monitored

The workflow checks the RU, LV and EN versions of:

- Home page
- Certificates
- Home visit / mobile massage

It tracks Lighthouse scores for Performance, SEO, Accessibility and Best Practices, plus LCP, CLS and total page weight.

## Thresholds

- SEO: 95+ (fails below this)
- Performance: 80+ (warning below this)
- Accessibility: 90+ (warning below this)
- Best Practices: 90+ (warning below this)
- LCP: <= 2.5 s
- CLS: <= 0.10
- Total page weight: <= 4 MB

## Schedule

Runs automatically every day at 05:00 UTC and on every push to `main`. It can also be started manually from the **Actions** tab.

Each run keeps the generated Lighthouse HTML/JSON reports as a GitHub Actions artifact for 90 days.
