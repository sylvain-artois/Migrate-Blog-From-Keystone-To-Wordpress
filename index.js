
require('dotenv').config();

const vorpal    = require('vorpal')();
const importer  = require('./src/modules/importer');

vorpal
    .command('import', 'Launch the import script')
    .action(function(args, next) {
        importer.auth(
            process.env.WP_JSON_ENDPOINT,
            process.env.WP_USER,
            process.env.WP_PASSWORD
        );
        importer.run( args.start || 0, args.nb || 1);
        next();
    });

vorpal
    .delimiter('WPimport')
    .show();
