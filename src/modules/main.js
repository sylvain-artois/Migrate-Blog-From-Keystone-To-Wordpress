
const importer  = require('./importer');

module.exports =  {
    main: function (start, nb, done) {
        importer.auth(
            process.env.WP_JSON_ENDPOINT,
            process.env.WP_USER,
            process.env.WP_PASSWORD
        );

        importer.run(start || 0, nb || 1, done);
    }
};
