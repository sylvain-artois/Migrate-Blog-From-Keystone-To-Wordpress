const vorpal = require('vorpal')();
const importer = require('./src/modules/importer');

vorpal
    .command('import', 'Launch the import script')
    .action(function(args, next) {
        importer.import();
        next();
    });

vorpal
    .delimiter('WPimport')
    .show();
