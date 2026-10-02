module.exports = {
  ci: {
    collect: {
      url: [
        'https://komarovmassage.lv/ru/',
        'https://komarovmassage.lv/lv/',
        'https://komarovmassage.lv/en/',
        'https://komarovmassage.lv/ru/certificates',
        'https://komarovmassage.lv/lv/certificates',
        'https://komarovmassage.lv/en/certificates',
        'https://komarovmassage.lv/ru/vyezd',
        'https://komarovmassage.lv/lv/vyezd',
        'https://komarovmassage.lv/en/vyezd',
      ],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.80 }],
        'categories:accessibility': ['warn', { minScore: 0.90 }],
        'categories:best-practices': ['warn', { minScore: 0.90 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.10 }],
        'total-byte-weight': ['warn', { maxNumericValue: 4000000 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './lhci-reports',
      reportFilenamePattern: '%%HOSTNAME%%-%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%',
    },
  },
};
