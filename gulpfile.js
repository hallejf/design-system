// Copyright (c) 2015-present, salesforce.com, inc. All rights reserved
// Licensed under BSD 3-Clause - see LICENSE.txt or git.io/sfdc-license

import { spawn } from 'child_process';
import del from 'del';
import glob from 'glob';
import gulp from 'gulp';
import path from 'path';
import touch from 'touch';
import webpack from 'webpack';
import { argv } from 'yargs';

import * as accessibility from './scripts/gulp/accessibility';
import * as examples from './scripts/gulp/generate/examples';
import * as tokens from './scripts/gulp/generate/tokens';
import * as lint from './scripts/gulp/lint';
import * as styles from './scripts/gulp/styles';

import paths from './scripts/helpers/paths';
import * as travis from './scripts/helpers/travis';

const getComponents = key =>
  argv.components
    ? String(argv.components)
        .split(',')
        .map(comp => `.html/${comp}*.html`)
    : ['.html/*.html'];

// /////////////////////////////////////////////////////////
// Clean
// /////////////////////////////////////////////////////////

gulp.task('clean', () =>
  del([
    paths.generated,
    paths.tmp,
    paths.logs,
    paths.build,
    paths.html,
    path.join(paths.designTokens, 'dist')
  ])
);

// /////////////////////////////////////////////////////////
// Examples
// /////////////////////////////////////////////////////////

gulp.task(
  'generate:examples:wrapped',
  gulp.series(examples.unwrapped, examples.unwrappedDocs, examples.wrapped)
);

// /////////////////////////////////////////////////////////
// Tokens
// /////////////////////////////////////////////////////////

gulp.task('generate:tokens:sass:default', tokens.sassDefault);
gulp.task('generate:tokens:sass:map', tokens.sassMap);
gulp.task(
  'generate:tokens:sass',
  gulp.parallel('generate:tokens:sass:default', 'generate:tokens:sass:map')
);
gulp.task('generate:tokens:components:imports', tokens.componentsImports);
gulp.task(
  'generate:tokens:all',
  gulp.series('generate:tokens:components:imports', tokens.all)
);

// /////////////////////////////////////////////////////////
// Lint
// /////////////////////////////////////////////////////////

const a11y = done => {
  accessibility.axe(getComponents(), done);
};

const vnu = () => accessibility.vnu(getComponents());

// gulp a11y
// gulp a11y --components path
// gulp a11y --components path,tabs,data-tables
gulp.task('lint:a11y', gulp.series('generate:examples:wrapped', a11y));

// gulp lint:vnu
// gulp lint:vnu --components path
// gulp lint:vnu --components path,tabs,data-tables
gulp.task('lint:vnu', () => gulp.series('generate:examples:wrapped', vnu));

gulp.task('lint:sass', lint.sass);
gulp.task('lint:spaces', lint.spaces);
gulp.task('lint:javascript', lint.javascript);
gulp.task('lint:javascript:test', lint.javascriptTest);
gulp.task('lint:html', lint.html);
gulp.task('lint:markup', lint.markup);
gulp.task('lint:tokens:yml', lint.tokensYml);
gulp.task('lint:tokens:components', lint.tokensComponents);
gulp.task('lint:tokens:aliases', lint.tokensAliases);

gulp.task(
  'lint:tokens',
  gulp.parallel(
    'lint:tokens:yml',
    'lint:tokens:components',
    'lint:tokens:aliases'
  )
);

gulp.task(
  'lint:examples',
  gulp.series(
    'generate:examples:wrapped',
    gulp.parallel(vnu, lint.markup, a11y)
  )
);

gulp.task(
  'lint',
  gulp.parallel(
    'lint:sass',
    'lint:spaces',
    'lint:javascript',
    'lint:javascript:test',
    'lint:html',
    'lint:tokens',
    'lint:examples'
  )
);

// /////////////////////////////////////////////////////////
// Styles
// /////////////////////////////////////////////////////////

gulp.task('styles:sass', styles.sass);
gulp.task('styles:test', styles.sassTest);
gulp.task(
  'styles',
  gulp.series(
    gulp.parallel('generate:tokens:sass'),
    gulp.parallel('styles:sass', 'styles:test')
  )
);
gulp.task('styles:stats', gulp.series('styles', styles.stylestats));

// /////////////////////////////////////////////////////////
// Build
// /////////////////////////////////////////////////////////

gulp.task('build', gulp.series('clean', 'generate:tokens:all', 'styles'));

// /////////////////////////////////////////////////////////
// Test
// /////////////////////////////////////////////////////////

export const watch = () =>
  gulp.watch(paths.watch.sass).on('change', changedPath => {
    console.log(changedPath);
    console.log(`Compiling Sass...`);
    gulp.series('styles:sass')(() => {
      const pattern = /ui\/(.+?)\/(.+?)\//;
      const match = changedPath.match(pattern);
      if (match) {
        const [type, id] = match.slice(1);
        glob
          .sync(path.resolve(paths.ui, `${type}/${id}/**/*.spec.{js,jsx}`))
          .slice(0, 1)
          .map(p => touch.sync(p));
      }
    });
  });

// /////////////////////////////////////////////////////////
// Travis
// /////////////////////////////////////////////////////////

gulp.task('travis:lint:examples', gulp.parallel(vnu, lint.markup, a11y));

gulp.task('travis', done => {
  if (!travis.shouldPushToBuildServer()) return done();
  return gulp.series(
    'build',
    travis.jest,
    'lint',
    travis.createSnapshots,
    travis.lintExamples,
    travis.publishBuild
  )(done);
});
