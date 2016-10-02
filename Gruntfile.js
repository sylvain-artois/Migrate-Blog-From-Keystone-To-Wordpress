'use strict';

require('dotenv').config();

const script = require('./src/modules/main');

module.exports = function(grunt) {

  grunt.initConfig({
    nodeunit: {
      files: ['test/**/*_test.js'],
    },
    jshint: {
      options: {
        jshintrc: '.jshintrc'
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      lib: {
        src: ['src/**/*.js']
      },
      test: {
        src: ['test/**/*.js']
      },
    }
  });

  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.registerTask('import', 'Launch import', function(start, nb) {

    const done = this.async();

    grunt.log.writeln('Import start');

    try{
      script.main(start, nb, done);
    } catch (err) {
      grunt.fail.fatal(err);
    }

  });

  grunt.registerTask('default', ['import']);
};
