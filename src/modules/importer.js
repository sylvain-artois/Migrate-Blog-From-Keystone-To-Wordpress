
const WPAPI = require( 'wpapi' );

module.exports = new Importer();

/**
 * @constructor
 */
function Importer() {
    this.wp = null;
    this.cache = [];
}

/**
 * @param url
 * @param username
 * @param password
 */
Importer.prototype.run = function (url, username, password) {
    console.log('import start');
    authenticate.call(this, url, username, password);
    test.call(this);
};

/**
 * @param url
 * @param username
 * @param password
 */
function authenticate(url, username, password) {

    const _this = this;

    this.wp = new WPAPI({
        endpoint: url,
        username: username,
        password: password,
        auth: true,
        transport: {
            // Only override the transport for the GET method, in this example
            // Transport methods should take a wpreq object and a callback:
            get: function( wpreq, cb ) {
                let result = _this.cache[ wpreq ];
                // If a cache hit is found, return it via the same callback/promise
                // signature as the default transport method:
                if ( result ) {
                    if ( cb && typeof cb === 'function' ) {
                        // Invoke the callback function, if one was provided
                        cb( null, result );
                    }
                    // Return the data as a promise
                    return Promise.resolve( result );
                }

                // Delegate to default transport if no cached data was found
                return WPAPI.transport.get( wpreq, cb ).then(function( result ) {
                    _this.cache[ wpreq ] = result;
                    return result;
                });
            }
        }
    });
}

function test() {
    this.wp.posts().then(function( data ) {
        console.log(data);
    }).catch(function( err ) {
        console.error(err);
    });
}
