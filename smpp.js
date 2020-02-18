/**
 * Fake SMPP.
 */
const smpp = require('smpp');
const winston = require('winston');
const MESSAGE = Symbol.for('message');

const jsonFormatter = (logEntry) => {
    const base = { timestamp: new Date() };
    const json = Object.assign(base, logEntry);
    logEntry[MESSAGE] = JSON.stringify(json);
    return logEntry;
};

const strftime = require('strftime');
const optimist = require('optimist');
var argv = optimist
    .options('port', {alias: 'p', default: 2775, describe: 'Port which server listen to.'})
    .options('ddmin', {default: 0, describe: 'Minimum delay after submit_sm requested and deliver_sm request to ESME.'}) // delivery min delay
    .options('ddmax', {default: 0, describe: 'Maximum delay after submit_sm requested and deliver_sm request to ESME.'}) // delivery max delay
    .options('statuses', {
        alias: 's',
        default: 'delivered',
        describe: "Comma separated list of statuses, server send in deliver_sm request to ESME."
    })
    .options('auth', {
        default: 'user:pass',
        describe: 'Comma separated auth credentials in format [system_id]:[password]'
    })
    .options('help', {default: false, alias: 'h', describe: 'Current help.'})
    .argv;

if (argv.help) {
    optimist.showHelp();
    return;
}

const Statuses = require('./statuses').Statuses;
// Read auth data
let auth_data = function (str) {
    let auth = {};
    str.split(",").map(function (str) {
        let l = str.split(":");
        if (l.length > 0 && l[0] != '') {
            let val = "";
            let key = l[0];
            if (l.length > 1) {
                val = l[1];
            }
            auth[key] = val;
        }
    });
    return auth;
}(argv.auth);

// Init logger
let logger = new winston.createLogger({
    level: 'info',
    format: winston.format(jsonFormatter)(),
    transports: [
        new winston.transports.File({filename: '/var/log/fakesmpp.log', level: 'info'}),
        new winston.transports.Console({filename: 'info.logs', level: 'info', timestamp: true})
    ]
});

// List of statuses which we iterate in response.
let statuses = new Statuses(argv.statuses.split(','));

// Validate options
if (argv.ddmax < argv.ddmin) {
    logger.error("ddmin(%d) > ddmax(%d)", argv.ddmin, arg.ddmax);
}

const server = smpp.createServer(function (session) {
    session.on('bind_transceiver', function (pdu) {
        logger.info("bind_transceiver requested.", {system_id: pdu.system_id});
        session.on('submit_sm', function (pdu) {
            let msg_received_on = new Date();
            let r = Math.floor(Math.random() * (99 - 10) + 10);
            let msg_id = `${msg_received_on.getTime()}.${r}`;
            let delivery_delay = getDeliveryDelay(argv.ddmin, argv.ddmax);
            logger.info(`Msg was received, id=${msg_id} assigned. PDU:${JSON.stringify(pdu)} and body ${pdu.short_message.message.toString()}`);

            logger.info(`Send submit_sm_resp for id=${msg_id}.`);
            session.send(pdu.response({
                message_id: msg_id,
            }));

            // Send request to ESME to confirm delivery
            setTimeout(function () {
                let status = statuses.next();
                let dr = getDeliveryReceipt(msg_id, status, msg_received_on, new Date(), pdu.short_message.message.toString());
                logger.info(`delivery_sm.short_message=${dr}`);
                logger.info(`Send deliver_sm for id=${msg_id} with status.stat=${status.stat}, status.err=${status.err}.`);
                session.deliver_sm({
                    source_addr: pdu.source_addr,
                    source_addr_ton: pdu.source_addr_ton,
                    source_addr_npi: pdu.source_addr_npi,
                    dest_addr_ton: pdu.dest_addr_ton,
                    dest_addr_npi: pdu.dest_addr_npi,
                    destination_addr: pdu.destination_addr,
                    short_message: dr,
                    esm_class: smpp.ESM_CLASS.MC_DELIVERY_RECEIPT,
                    sequence_number: pdu.sequence_number,
                }, function (pdu) {
                    logger.info("deliver_sm_resp received.");
                });
            }, delivery_delay);
        });

        // Availability check
        session.on('enquire_link', function (pdu) {
            session.send(pdu.response());
        });
        session.on('unbind', function (pdu) {
            session.send(pdu.response());
            session.close();
        });
        // we pause the session to prevent further incoming pdu events,
        // untill we authorize the session with some async operation.
        session.pause();
        checkAsyncUserPass(pdu.system_id, pdu.password, function (err) {
            if (err) {
                logger.error("bind_transceiver failed. Incorrert credentials.");
                session.send(pdu.response({
                    command_status: smpp.ESME_RBINDFAIL
                }));
                session.close();
                return;
            }
            session.send(pdu.response());
            logger.info("bind_transceiver completed successfully.", {system_id: pdu.system_id});
            session.resume();
        });
    });
});
server.listen(argv.port);
logger.info(`Server listen port #${argv.port}`);

//
// Check if system_id with password has access to send messages.
//
function checkAsyncUserPass(system_id, password, func) {
    if (system_id in auth_data && auth_data[system_id] == password) {
        func(false);
    } else {
        func(true);
    }
}

//
// Return random delay for delivery_sm answer
//
function getDeliveryDelay(min, max) {
    if (min == max) {
        return min;
    }

    return Math.random() * (max - min) + min;
}

//
// Return SMPP protocol formatted delivery_receipt.
//
function getDeliveryReceipt(msg_id, status, received_on, done_on, message) {
    let receipt = {
        id: msg_id,
        sub: "001", // not used in fact
        dlvrd: 1, // not used in fact
        "submit date": strftime("%y%m%d%H%M", received_on),
        "done date": strftime("%y%m%d%H%M", done_on),
        stat: status.stat,
        err: status.err,
        text: message.substring(0, 20) // first 20 symbols of the message
    };
    let delivery_receipt_a = [];
    for (var k in receipt) {
        delivery_receipt_a.push(k + ":" + receipt[k]);
    }

    return delivery_receipt_a.join(" ")
}

